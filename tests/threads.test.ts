import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import { CONTACT_DEMO_PROMPT } from '@/lib/agents/demo/catalog';
import { DemoProvider } from '@/lib/agents/demo/demoProvider';
import { FOLLOWUPS, applyPatch, criterionApplies, fillFollowup, pickFollowups, type Followup } from '@/lib/agents/demo/followups';
import { staticReview } from '@/lib/agents/provider';
import { PREVIEW_ERROR_CAPTURE_SCRIPT, PREVIEW_TEST_SCRIPT, isPreviewTestMessage, type PreviewTestMessage } from '@/lib/client/previewTests';
import { runWorkflow } from '@/lib/engine/workflow';
import { MemoryRunRepository } from '@/lib/persistence/memoryRepository';
import { discardLatestRun, threadContext } from '@/lib/server/threads';
import type { Run, Thread } from '@/lib/types';
import { buildPreviewDocument, buildWorkspace, snapshotOf, workspaceSteps } from '@/lib/workspace';

const provider = new DemoProvider();

const LOGIN_PROMPT = 'genera un inicio de sesion que acceda a una reserba de calendario de intervalo 30 minutos para una llamada';
/** Hilo de login sin calendario: así quedó el hilo real del usuario con la versión anterior. */
const LOGIN_ONLY_PROMPT = 'Implementa el login de usuarios con sesión segura';
const BOOKING_PROMPT =
  'no consigue acceder al calendario y registrar una reserba, asegurate de que al iniciar sesion se acceda y quede registrado que usuarios han hecho reservas';
const REMOVE_AND_BOOK_PROMPT = 'elimina la nota, necesito una implementacion real de un calendario que agende sesiones de llamada';

/** Ejecuta una implementación sobre la memoria del hilo, como hace la API. */
async function implement(thread: Thread, prompt: string, maxIterations = 3): Promise<Run> {
  const ctx = threadContext(thread);
  const run = await runWorkflow({ prompt, maxIterations, provider, threadId: thread.id, ...ctx });
  thread.runs.push(run);
  return run;
}

function newThread(): Thread {
  return { id: 't-1', title: 'Hilo', createdAt: '', updatedAt: '', runs: [] };
}

function workspaceOf(thread: Thread): Record<string, string> {
  return threadContext(thread).initialWorkspace;
}

async function previewTests(files: Record<string, string>): Promise<PreviewTestMessage> {
  const dom = new JSDOM(buildPreviewDocument(files, PREVIEW_TEST_SCRIPT, PREVIEW_ERROR_CAPTURE_SCRIPT)!, { runScripts: 'dangerously', pretendToBeVisual: true });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('sin respuesta')), 4000);
      dom.window.addEventListener('message', (e) => {
        if (isPreviewTestMessage(e.data)) {
          clearTimeout(timer);
          resolve(e.data);
        }
      });
    });
  } finally {
    dom.window.close();
  }
}

const failures = (m: PreviewTestMessage) => m.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.detail}`);

describe('hilos · memoria del workspace', () => {
  it('la segunda implementación parte del workspace de la primera y modifica sus archivos', async () => {
    const thread = newThread();
    const first = await implement(thread, CONTACT_DEMO_PROMPT);
    expect(first.threadId).toBe('t-1');
    expect(first.status).toBe('passed');

    const second = await implement(thread, 'Añade un modo oscuro');
    expect(second.status).toBe('passed');
    expect(second.logs.some((l) => /Memoria del hilo: 1 implementación/.test(l.message))).toBe(true);
    expect(second.messages[0].content).toMatch(/ya tiene 4 archivo\(s\)/);

    const summary = second.changes.map((c) => `${c.kind}:${c.path}`);
    expect(summary).toContain('modified:styles.css');
    expect(summary).toContain('created:theme.js');
    expect(summary).toContain('modified:index.html');
    const css = second.changes.filter((c) => c.path === 'styles.css').at(-1)!;
    expect(css.before).toContain('@media (max-width: 600px)');
    expect(css.after).toContain('@media (max-width: 600px)');
    expect(css.after).toContain('html.theme-dark body {');
  });

  it('Testing hace una comprobación de regresión con lo ya aprobado', async () => {
    const thread = newThread();
    await implement(thread, CONTACT_DEMO_PROMPT);
    const second = await implement(thread, 'Añade un pie de página');
    const regression = second.iterations.at(-1)!.results.find((r) => r.criterionId === 'regression')!;
    expect(regression.passed).toBe(true);
    expect(regression.detail).toMatch(/10 criterio\(s\)/); // 3 + 3 + 4 criterios de la demo de contacto
  });

  it('la regresión falla si una implementación rompe lo anterior', async () => {
    const run = await runWorkflow({
      prompt: 'Añade un pie de página',
      maxIterations: 3,
      provider,
      initialWorkspace: { 'index.html': '<html><body>\n</body></html>' },
      regressionCriteria: [{ id: 'old', description: 'Algo que ya no existe', file: 'index.html', expect: ['id="desaparecido"'] }],
    });
    const regression = run.iterations.at(-1)!.results.find((r) => r.criterionId === 'regression')!;
    expect(regression.passed).toBe(false);
    expect(run.status).toBe('failed');
  });

  it('las mejoras se encadenan: modo oscuro + pie + novedades, y la página sigue funcionando', async () => {
    const thread = newThread();
    await implement(thread, CONTACT_DEMO_PROMPT);
    await implement(thread, 'Añade un modo oscuro');
    await implement(thread, 'Añade un pie de página con el año');
    const last = await implement(thread, 'Registra en novedades: ofertas de temporada');
    expect(thread.runs.map((r) => r.status)).toEqual(['passed', 'passed', 'passed', 'passed']);
    expect(last.messages[0].content).toMatch(/registro de novedades/);

    const message = await previewTests(workspaceOf(thread));
    expect(message.suite).toBe('contact');
    expect(failures(message)).toEqual([]);
    const names = message.results.map((r) => r.name);
    expect(names).toContain('El selector de tema alterna el modo oscuro');
    expect(names).toContain('El pie de página muestra el año actual');
    expect(names).toContain('«Novedades» muestra las mejoras pedidas en el hilo');
  });
});

describe('hilos · peticiones sin plantilla en modo demo', () => {
  it('no inventa una implementación: lo explica y no toca archivos', async () => {
    const thread = newThread();
    await implement(thread, 'Construye una lista de tareas con filtros');
    const run = await implement(thread, 'Añade etiquetas de colores');
    expect(run.status).toBe('failed');
    expect(run.tasks).toEqual([]);
    expect(run.changes).toEqual([]);
    expect(run.summary).toMatch(/modo LLM/);
    expect(run.summary).toMatch(/calendario/);
    expect(Object.keys(workspaceOf(thread))).not.toContain('changelog.js');
  });

  it('si no hay nada que cambiar, termina sin cambios y aprobado', async () => {
    const thread = newThread();
    await implement(thread, CONTACT_DEMO_PROMPT);
    const run = await implement(thread, 'Elimina la nota de novedades');
    expect(run.status).toBe('passed');
    expect(run.tasks).toEqual([]);
    expect(run.summary).toMatch(/nada que cambiar/);
  });

  it('dos registros explícitos en «Novedades» quedan como dos entradas', async () => {
    const thread = newThread();
    await implement(thread, 'Construye una lista de tareas con filtros');
    await implement(thread, 'Añade a novedades: etiquetas de colores');
    const third = await implement(thread, 'Registra en novedades: exportar a CSV');
    const sectionTask = third.tasks[0];
    expect(third.changes.filter((c) => c.taskId === sectionTask.id)).toEqual([]); // la sección ya existía
    const js = workspaceOf(thread)['changelog.js'];
    expect(js.match(/addChangelogEntry\('m/g)).toHaveLength(2);
    expect(js).toContain('"Registra en novedades: exportar a CSV"');
  });
});

describe('hilos · calendario de llamadas (caso del usuario)', () => {
  it('la primera petición del usuario (login + calendario) construye las dos cosas en la misma implementación', async () => {
    const thread = newThread();
    const run = await implement(thread, LOGIN_PROMPT);
    expect(run.status).toBe('passed');
    expect(run.tasks.map((t) => t.title)).toEqual([
      'Maquetar la pantalla de inicio de sesión',
      'Validar las credenciales',
      'Gestionar el inicio y el cierre de sesión',
      'Agenda: preparar la página y el calendario',
      'Agenda: lógica de huecos y reservas',
      'Agenda: conectar el calendario con el usuario',
      'Validación de integración final',
    ]);
    expect(run.messages[0].content).toMatch(/inicio de sesión.*calendario/);
    const message = await previewTests(workspaceOf(thread));
    expect(message.suite).toBe('login');
    expect(failures(message)).toEqual([]);
    expect(message.results.map((r) => r.name)).toContain('Al iniciar sesión se puede reservar y queda registrado el usuario');
  });

  it('sobre un login ya existente: añade el calendario, exige sesión y registra qué usuario reserva', async () => {
    const thread = newThread();
    const first = await implement(thread, LOGIN_ONLY_PROMPT);
    expect(first.tasks[0].title).toBe('Maquetar la pantalla de inicio de sesión');

    const run = await implement(thread, BOOKING_PROMPT);
    expect(run.status).toBe('passed');
    const summary = run.changes.map((c) => `${c.kind}:${c.path}`);
    expect(summary).toEqual(expect.arrayContaining(['created:agenda.js', 'created:booking.js', 'modified:index.html', 'modified:styles.css', 'modified:app.js']));
    // Integra el login: al iniciar/cerrar sesión avisa al calendario.
    const app = workspaceOf(thread)['app.js'];
    expect(app).toContain("new CustomEvent('agentflow:session', { detail: user })");
    expect(app).toContain("new CustomEvent('agentflow:session', { detail: null })");
    // Hubo un fallo controlado y se corrigió.
    expect(run.iterations.some((i) => !i.passed)).toBe(true);

    const message = await previewTests(workspaceOf(thread));
    expect(message.suite).toBe('login');
    expect(failures(message)).toEqual([]);
    const names = message.results.map((r) => r.name);
    expect(names).toContain('Sin sesión iniciada no se puede reservar');
    expect(names).toContain('Al iniciar sesión se puede reservar y queda registrado el usuario');
    expect(names).toContain('No permite reservar dos veces el mismo hueco');
  });

  it('la versión que Testing rechazó falla al usarla (el calendario no se bloquea al cerrar sesión)', async () => {
    const thread = newThread();
    await implement(thread, LOGIN_ONLY_PROMPT);
    const run = await implement(thread, BOOKING_PROMPT);
    const lastTask = run.tasks.filter((t) => t.assignee === 'develop').at(-1)!;
    const all = [...thread.runs[0].changes, ...run.changes];
    const step = workspaceSteps(all).find((s) => s.taskId === lastTask.id && s.iteration === 1)!;
    const message = await previewTests(snapshotOf(buildWorkspace(all, step.upto)));
    expect(failures(message).join('\n')).toMatch(/Sin sesión iniciada no se puede reservar/);
  });

  it('«elimina la nota» + calendario en una sola petición: borra Novedades y conserva el calendario', async () => {
    const thread = newThread();
    await implement(thread, LOGIN_ONLY_PROMPT);
    await implement(thread, 'Registra en novedades: horario de verano');
    expect(Object.keys(workspaceOf(thread))).toContain('changelog.js');

    const run = await implement(thread, REMOVE_AND_BOOK_PROMPT);
    expect(run.status).toBe('passed');
    expect(run.messages[0].content).toMatch(/eliminar «Novedades» \+ calendario/);
    const summary = run.changes.map((c) => `${c.kind}:${c.path}`);
    expect(summary).toContain('deleted:changelog.js');
    expect(summary).toContain('created:booking.js');

    const ws = workspaceOf(thread);
    expect(Object.keys(ws)).not.toContain('changelog.js');
    expect(ws['index.html']).not.toContain('novedades');
    expect(ws['styles.css']).not.toContain('.af-changelog');
    // La eliminación intencionada no cuenta como regresión.
    const regression = run.iterations.at(-1)!.results.find((r) => r.criterionId === 'regression')!;
    expect(regression.passed).toBe(true);

    const message = await previewTests(ws);
    expect(failures(message)).toEqual([]);
    expect(message.results.map((r) => r.name)).not.toContain('«Novedades» muestra las mejoras pedidas en el hilo');
  });

  it('en un hilo nuevo crea una agenda completa que pide el email de quien reserva', async () => {
    const thread = newThread();
    const run = await implement(thread, 'Crea un calendario para agendar sesiones de llamada');
    expect(run.status).toBe('passed');
    expect(Object.keys(workspaceOf(thread)).sort()).toEqual(['agenda.js', 'booking.js', 'index.html', 'styles.css']);
    const message = await previewTests(workspaceOf(thread));
    expect(message.suite).toBe('booking');
    expect(failures(message)).toEqual([]);
    expect(message.results.map((r) => r.name)).toContain('Reservar un hueco lo registra con el email del usuario');
  });
});

describe('hilos · descartar', () => {
  let repo: MemoryRunRepository;
  let thread: Thread;

  beforeEach(async () => {
    repo = new MemoryRunRepository();
    thread = newThread();
    await repo.saveThread({ id: thread.id, title: 'Hilo', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' });
    for (const prompt of [CONTACT_DEMO_PROMPT, 'Añade un modo oscuro']) {
      const run = await implement(thread, prompt);
      await repo.saveRun(run);
    }
  });

  it('descarta solo la última implementación activa y su trabajo sale del workspace', async () => {
    const before = threadContext((await repo.getThread(thread.id))!);
    expect(Object.keys(before.initialWorkspace)).toContain('theme.js');

    const result = await discardLatestRun(repo, thread.id, thread.runs[1].id);
    expect(result.ok).toBe(true);
    const after = (await repo.getThread(thread.id))!;
    expect(after.runs.map((r) => r.discarded)).toEqual([false, true]);
    const ctx = threadContext(after);
    expect(Object.keys(ctx.initialWorkspace)).not.toContain('theme.js');
    expect(ctx.initialWorkspace['styles.css']).not.toContain('theme-dark');
    expect(ctx.history).toEqual([CONTACT_DEMO_PROMPT]);
  });

  it('no permite descartar una implementación que no es la última activa', async () => {
    const result = await discardLatestRun(repo, thread.id, thread.runs[0].id);
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it('se pueden descartar todas en orden y luego no queda nada', async () => {
    expect((await discardLatestRun(repo, thread.id)).ok).toBe(true);
    expect((await discardLatestRun(repo, thread.id)).ok).toBe(true);
    expect(await discardLatestRun(repo, thread.id)).toMatchObject({ ok: false, status: 409 });
    expect(await discardLatestRun(repo, 'no-existe')).toMatchObject({ ok: false, status: 404 });
  });

  it('la lista de hilos resume implementaciones activas y descartadas', async () => {
    await discardLatestRun(repo, thread.id);
    const [summary] = await repo.listThreads();
    expect(summary).toMatchObject({ id: thread.id, runCount: 2, activeRunCount: 1 });
  });
});

describe('mejoras del modo demo · catálogo', () => {
  async function finalWorkspace(prompts: string[]): Promise<Record<string, string>> {
    const thread = newThread();
    for (const p of prompts) await implement(thread, p);
    return workspaceOf(thread);
  }
  /** Workspace sobre el que se aplica cada mejora en el test de coherencia. */
  async function baseFor(f: Followup): Promise<Record<string, string>> {
    if (f.id === 'remove-news') return finalWorkspace([CONTACT_DEMO_PROMPT, 'Registra en novedades: algo']);
    if (f.id === 'booking') return finalWorkspace([LOGIN_ONLY_PROMPT]);
    return finalWorkspace([CONTACT_DEMO_PROMPT]);
  }

  it.each([
    ['Añade un modo oscuro', ['dark']],
    ['Pon un footer con copyright', ['footer']],
    ['Añade etiquetas de colores', []],
    [BOOKING_PROMPT, ['booking']],
    [REMOVE_AND_BOOK_PROMPT, ['remove-news', 'booking']],
    ['Quita las novedades', ['remove-news']],
    ['Registra en novedades: algo', ['changelog']],
  ])('«%s» → %j', (prompt, ids) => {
    expect(pickFollowups(prompt).map((f) => f.id)).toEqual(ids);
  });

  it.each(FOLLOWUPS.map((f) => [f.id, f] as const))('mejora «%s»: cada criterio aplicable falla si se omite y pasa si se aplica', async (_id, followup) => {
    const prompt = 'Petición de prueba';
    const base = await baseFor(followup);
    const all = followup.tasks
      .flatMap((t) => t.criteria)
      .filter((c) => criterionApplies(c, base))
      .map((c) => ({ ...c, expect: c.expect?.map((e) => fillFollowup(e, prompt)), snippet: c.snippet && fillFollowup(c.snippet, prompt) }));
    expect(all.length).toBeGreaterThan(0);

    const apply = (files: Record<string, string>, c: (typeof all)[number]) => {
      if (c.deleteFile) {
        const { [c.file]: _removed, ...rest } = files;
        return rest;
      }
      return { ...files, [c.file]: applyPatch(files[c.file] ?? '', c) };
    };
    for (const target of all) {
      let files = base;
      for (const c of all) if (c.id !== target.id) files = apply(files, c);
      const without = staticReview(files, all);
      expect(without.results.filter((r) => !r.passed).map((r) => r.criterionId)).toEqual([target.id]);
      expect(staticReview(apply(files, target), all).results.every((r) => r.passed)).toBe(true);
    }
  });

  it('aplicar un parche dos veces no duplica el código', () => {
    const criterion = FOLLOWUPS.find((f) => f.id === 'dark')!.tasks[1].criteria[1]; // dark-load
    const once = applyPatch('<html>\n<body>\n</body>\n</html>\n', criterion);
    expect(applyPatch(once, criterion)).toBe(once);
    expect(once).toMatch(/ {2}<script src="theme.js"><\/script>\n<\/body>/);
  });

  it('eliminar un bloque es idempotente y no deja líneas en blanco dobles', () => {
    const removal = FOLLOWUPS.find((f) => f.id === 'remove-news')!.tasks[0].criteria[0];
    const html = '<body>\n  <main></main>\n\n  <section id="novedades">\n    <ul id="novedades-list"></ul>\n  </section>\n\n  <script src="a.js"></script>\n</body>\n';
    const once = applyPatch(html, removal);
    expect(once).toBe('<body>\n  <main></main>\n\n  <script src="a.js"></script>\n</body>\n');
    expect(applyPatch(once, removal)).toBe(once);
  });

  it('la petición se inserta en el JS como literal seguro', () => {
    const out = fillFollowup('{{PROMPT_JSON}}', 'Hola </script><script>alert(1)</script>');
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out.replace(/\\u003c/g, '<'))).toBe('Hola </script><script>alert(1)</script>');
  });
});

describe('API · hilos', () => {
  beforeEach(() => {
    process.env.AGENTFLOW_MODE = 'demo';
    process.env.AGENTFLOW_DEMO_DELAY_MS = '0';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  const post = (body: unknown, ip: string) =>
    new Request('http://localhost/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) });

  async function runVia(body: unknown, ip: string): Promise<Run> {
    const { POST } = await import('@/app/api/runs/route');
    const res = await POST(post(body, ip));
    expect(res.status).toBe(200);
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    return lines.find((e) => e.type === 'run_finished').run;
  }

  it('crea un hilo, implementa sobre él, lo lista y descarta', async () => {
    const first = await runVia({ prompt: 'Haz una calculadora de propinas' }, '7.7.7.1');
    const second = await runVia({ prompt: 'Añade un modo oscuro', threadId: first.threadId }, '7.7.7.2');
    expect(second.threadId).toBe(first.threadId);
    expect(second.changes.some((c) => c.kind === 'modified' && c.path === 'styles.css')).toBe(true);

    const list = await (await (await import('@/app/api/threads/route')).GET()).json();
    const summary = list.threads.find((t: { id: string }) => t.id === first.threadId);
    expect(summary).toMatchObject({ runCount: 2, activeRunCount: 2, title: 'Calculadora de propinas' });

    const detailRoute = await import('@/app/api/threads/[id]/route');
    const detail = await (await detailRoute.GET(new Request('http://x'), { params: Promise.resolve({ id: first.threadId }) })).json();
    expect(detail.thread.runs.map((r: Run) => r.id)).toEqual([first.id, second.id]);

    const discardRoute = await import('@/app/api/threads/[id]/discard/route');
    const discardReq = (body: unknown) =>
      new Request('http://x', { method: 'POST', headers: { 'x-forwarded-for': '7.7.7.3' }, body: JSON.stringify(body) });
    const wrong = await discardRoute.POST(discardReq({ runId: first.id }), { params: Promise.resolve({ id: first.threadId }) });
    expect(wrong.status).toBe(409);
    const ok = await discardRoute.POST(discardReq({ runId: second.id }), { params: Promise.resolve({ id: first.threadId }) });
    expect(ok.status).toBe(200);
    const okBody = await ok.json();
    expect(okBody.discardedRunId).toBe(second.id);
    expect(okBody.thread.runs.map((r: Run) => r.discarded)).toEqual([false, true]);

    const third = await runVia({ prompt: 'Añade un pie de página', threadId: first.threadId }, '7.7.7.4');
    const css = third.changes.find((c) => c.path === 'styles.css')!;
    expect(css.before).not.toContain('theme-dark');
  });

  it('valida el hilo: id mal formado (400) o inexistente (404)', async () => {
    const { POST } = await import('@/app/api/runs/route');
    expect((await POST(post({ prompt: 'Algo nuevo', threadId: 'nope' }, '7.7.8.1'))).status).toBe(400);
    expect((await POST(post({ prompt: 'Algo nuevo', threadId: '00000000-0000-4000-8000-000000000000' }, '7.7.8.2'))).status).toBe(404);
  });
});
