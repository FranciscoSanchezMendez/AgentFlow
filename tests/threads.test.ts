import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it } from 'vitest';
import { CONTACT_DEMO_PROMPT } from '@/lib/agents/demo/catalog';
import { DemoProvider } from '@/lib/agents/demo/demoProvider';
import { FOLLOWUPS, applyPatch, fillFollowup, pickFollowup } from '@/lib/agents/demo/followups';
import { staticReview } from '@/lib/agents/provider';
import { PREVIEW_ERROR_CAPTURE_SCRIPT, PREVIEW_TEST_SCRIPT, isPreviewTestMessage, type PreviewTestMessage } from '@/lib/client/previewTests';
import { runWorkflow } from '@/lib/engine/workflow';
import { MemoryRunRepository } from '@/lib/persistence/memoryRepository';
import { discardLatestRun, threadContext } from '@/lib/server/threads';
import type { Run, Thread } from '@/lib/types';
import { buildPreviewDocument, buildWorkspace, snapshotOf } from '@/lib/workspace';

const provider = new DemoProvider();

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
    // Los cambios se aplican sobre lo existente: el CSS conserva lo anterior.
    const css = second.changes.filter((c) => c.path === 'styles.css').at(-1)!;
    expect(css.before).toContain('@media (max-width: 600px)');
    expect(css.after).toContain('@media (max-width: 600px)');
    expect(css.after).toContain('html.theme-dark body {');
  });

  it('Testing hace una comprobación de regresión con lo ya aprobado', async () => {
    const thread = newThread();
    await implement(thread, CONTACT_DEMO_PROMPT);
    const second = await implement(thread, 'Añade un pie de página');
    const integration = second.iterations.at(-1)!;
    const regression = integration.results.find((r) => r.criterionId === 'regression')!;
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
    const last = await implement(thread, 'Añade un aviso de ofertas de temporada');
    expect(thread.runs.map((r) => r.status)).toEqual(['passed', 'passed', 'passed', 'passed']);
    expect(last.messages[0].content).toMatch(/registro de novedades/);

    const message = await previewTests(workspaceOf(thread));
    expect(message.suite).toBe('contact');
    expect(message.results.filter((r) => !r.passed)).toEqual([]);
    const names = message.results.map((r) => r.name);
    expect(names).toContain('El selector de tema alterna el modo oscuro');
    expect(names).toContain('El pie de página muestra el año actual');
    expect(names).toContain('«Novedades» muestra las mejoras pedidas en el hilo');
  });

  it('dos mejoras sin plantilla quedan registradas como dos novedades', async () => {
    const thread = newThread();
    await implement(thread, 'Construye una lista de tareas con filtros');
    await implement(thread, 'Añade etiquetas de colores');
    const third = await implement(thread, 'Permite exportar a CSV');
    // La sección ya existía: la primera tarea no necesita cambios.
    const sectionTask = third.tasks[0];
    expect(third.changes.filter((c) => c.taskId === sectionTask.id)).toEqual([]);
    const js = workspaceOf(thread)['changelog.js'];
    expect(js.match(/addChangelogEntry\('m/g)).toHaveLength(2);
    expect(js).toContain('"Permite exportar a CSV"');
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
  const base = async () => {
    const run = await runWorkflow({ prompt: CONTACT_DEMO_PROMPT, maxIterations: 3, provider });
    return snapshotOf(buildWorkspace(run.changes));
  };

  it.each([
    ['Añade un modo oscuro', 'dark'],
    ['Pon un footer con copyright', 'footer'],
    ['Añade etiquetas de colores', 'changelog'],
  ])('«%s» → %s', (prompt, id) => {
    expect(pickFollowup(prompt).id).toBe(id);
  });

  it.each(FOLLOWUPS.flatMap((f) => f.tasks.flatMap((t) => t.criteria.map((c) => [`${f.id}/${c.id}`, f, c.id] as const))))(
    'mejora %s: aplicarla cumple su criterio y omitirla lo hace fallar',
    async (_label, followup, id) => {
      const prompt = 'Petición de prueba';
      const all = followup.tasks.flatMap((t) => t.criteria).map((c) => ({ ...c, expect: c.expect.map((e) => fillFollowup(e, prompt)), snippet: fillFollowup(c.snippet, prompt) }));
      let files = await base();
      for (const c of all) if (c.id !== id) files = { ...files, [c.file]: applyPatch(files[c.file] ?? '', c) };
      const without = staticReview(files, all);
      expect(without.results.filter((r) => !r.passed).map((r) => r.criterionId)).toEqual([id]);
      const target = all.find((c) => c.id === id)!;
      const withIt = { ...files, [target.file]: applyPatch(files[target.file] ?? '', target) };
      expect(staticReview(withIt, all).results.every((r) => r.passed)).toBe(true);
    },
  );

  it('aplicar un parche dos veces no duplica el código', () => {
    const criterion = FOLLOWUPS[0].tasks[1].criteria[1]; // dark-load
    const once = applyPatch('<html>\n<body>\n</body>\n</html>\n', criterion);
    expect(applyPatch(once, criterion)).toBe(once);
    expect(once).toMatch(/ {2}<script src="theme.js"><\/script>\n<\/body>/);
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

    // La siguiente implementación parte del workspace SIN el modo oscuro descartado.
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
