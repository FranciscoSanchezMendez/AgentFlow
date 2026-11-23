import { describe, expect, it } from 'vitest';
import { CONTACT_DEMO_PROMPT } from '@/lib/agents/demo/catalog';
import { DemoProvider } from '@/lib/agents/demo/demoProvider';
import type { AgentProvider } from '@/lib/agents/provider';
import { runWorkflow } from '@/lib/engine/workflow';
import type { WorkflowEvent } from '@/lib/types';
import { buildWorkspace } from '@/lib/workspace';

const PROMPT = CONTACT_DEMO_PROMPT;

describe('runWorkflow (demo de contacto)', () => {
  it('completa todas las tareas con el límite por defecto (3 iteraciones)', async () => {
    const run = await runWorkflow({ prompt: PROMPT, maxIterations: 3, provider: new DemoProvider() });

    expect(run.status).toBe('passed');
    expect(run.error).toBeNull();
    expect(run.tasks.every((t) => t.status === 'completed')).toBe(true);
    expect(run.tasks).toHaveLength(4); // 3 de desarrollo + integración
    expect(run.tasks.at(-1)?.assignee).toBe('testing');
    expect(run.tasks.slice(0, 3).map((t) => t.attempts)).toEqual([1, 3, 2]);
    expect(run.totalIterations).toBe(6);
    expect(run.finishedAt).not.toBeNull();
  });

  it('Develop produce archivos concretos por tarea en el workspace', async () => {
    const run = await runWorkflow({ prompt: PROMPT, maxIterations: 3, provider: new DemoProvider() });
    const [layout, validation, submit] = run.tasks;

    expect(layout.files).toEqual(['index.html', 'styles.css']);
    expect(validation.files).toEqual(['validation.js']);
    expect(submit.files.sort()).toEqual(['app.js', 'index.html']);

    const final = buildWorkspace(run.changes);
    expect([...final.keys()]).toEqual(['app.js', 'index.html', 'styles.css', 'validation.js']);
    expect(final.get('validation.js')?.content).toContain('EMAIL_PATTERN.test(');
    expect(final.get('index.html')?.content).toContain('<script src="app.js"></script>');
  });

  it('registra creaciones y modificaciones con su versión anterior', async () => {
    const run = await runWorkflow({ prompt: PROMPT, maxIterations: 3, provider: new DemoProvider() });
    const summary = run.changes.map((c) => `${c.iteration}:${c.kind}:${c.path}`);
    expect(summary).toEqual([
      '1:created:index.html',
      '1:created:styles.css',
      '1:created:validation.js',
      '2:modified:validation.js',
      '3:modified:validation.js',
      '1:created:app.js',
      '1:modified:index.html', // la tarea 3 añade los <script> al index.html de la tarea 1
      '2:modified:app.js',
    ]);
    const created = run.changes[0];
    expect(created.before).toBeNull();
    const indexMod = run.changes.find((c) => c.kind === 'modified' && c.path === 'index.html')!;
    expect(indexMod.before).not.toContain('<script src="app.js">');
    expect(indexMod.after).toContain('<script src="app.js">');
    // Conserva el trabajo de la tarea 1 al modificar el archivo
    expect(indexMod.after).toContain('name="subject"');
  });

  it('Testing devuelve feedback concreto y Develop corrige en la siguiente iteración', async () => {
    const run = await runWorkflow({ prompt: PROMPT, maxIterations: 3, provider: new DemoProvider() });
    const validation = run.tasks[1];
    const its = run.iterations.filter((i) => i.taskId === validation.id);

    expect(its.map((i) => i.passed)).toEqual([false, false, true]);
    const firstFailures = its[0].results.filter((r) => !r.passed);
    expect(firstFailures.map((r) => r.criterionId)).toEqual(['val-email', 'val-length']);
    expect(firstFailures.every((r) => r.file === 'validation.js')).toBe(true);
    expect(firstFailures[0].detail).toContain('EMAIL_PATTERN.test(');
    expect(its[1].results.filter((r) => !r.passed).map((r) => r.criterionId)).toEqual(['val-length']);

    const kinds = run.messages.filter((m) => m.taskId === validation.id).map((m) => m.kind);
    expect(kinds).toEqual(['assignment', 'implementation', 'feedback', 'implementation', 'feedback', 'implementation', 'approval']);
    const feedback = run.messages.find((m) => m.taskId === validation.id && m.kind === 'feedback')!;
    expect(feedback.content).toContain('[val-email]');
    const impl = run.messages.find((m) => m.taskId === validation.id && m.kind === 'implementation' && m.iteration === 2)!;
    expect(impl.content).toContain('validation.js (modificado)');
  });

  it('respeta el límite de iteraciones y marca la tarea como fallida', async () => {
    const run = await runWorkflow({ prompt: PROMPT, maxIterations: 2, provider: new DemoProvider() });

    expect(run.status).toBe('failed');
    expect(run.tasks[1].status).toBe('failed');
    expect(run.tasks[1].attempts).toBe(2);
    expect(run.tasks[1].feedback.length).toBeGreaterThan(0);
    expect(run.tasks.at(-1)?.status).toBe('failed'); // integración
    expect(run.messages.some((m) => m.kind === 'escalation' && m.to === 'orchestrator')).toBe(true);
    for (const task of run.tasks) expect(task.attempts).toBeLessThanOrEqual(2);
  });

  it('con 1 iteración solo pasa la tarea que se implementa bien a la primera', async () => {
    const run = await runWorkflow({ prompt: PROMPT, maxIterations: 1, provider: new DemoProvider() });
    expect(run.tasks.slice(0, 3).map((t) => t.status)).toEqual(['completed', 'failed', 'failed']);
    expect(run.totalIterations).toBe(3);
  });

  it('emite eventos en orden, incluidos los cambios de archivos', async () => {
    const events: WorkflowEvent[] = [];
    await runWorkflow({ prompt: PROMPT, maxIterations: 3, provider: new DemoProvider(), onEvent: (e) => void events.push(e) });

    expect(events[0].type).toBe('run_started');
    expect(events.at(-1)?.type).toBe('run_finished');
    const types = new Set(events.map((e) => e.type));
    for (const t of ['agent_status', 'task_created', 'task_updated', 'file_changed', 'message', 'log', 'iteration']) {
      expect(types.has(t as WorkflowEvent['type'])).toBe(true);
    }
    // Cada cambio de archivo se emite antes de la iteración de Testing que lo revisa.
    const firstChange = events.findIndex((e) => e.type === 'file_changed');
    const firstIteration = events.findIndex((e) => e.type === 'iteration');
    expect(firstChange).toBeLessThan(firstIteration);
  });

  it('marca el run como error si un agente falla, sin lanzar excepción', async () => {
    const broken: AgentProvider = {
      mode: 'llm',
      label: 'roto',
      plan: async () => ({ rationale: 'x', tasks: [{ title: 'T', description: 'd', acceptanceCriteria: [{ id: 'a', description: 'a' }] }] }),
      implement: async () => {
        throw new Error('API caída');
      },
      review: async () => ({ results: [], feedback: [] }),
    };
    const events: WorkflowEvent[] = [];
    const run = await runWorkflow({ prompt: 'algo que hacer', maxIterations: 3, provider: broken, onEvent: (e) => void events.push(e) });

    expect(run.status).toBe('error');
    expect(run.error).toBe('API caída');
    expect(run.tasks.every((t) => t.status === 'failed')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(true);
    expect(events.at(-1)?.type).toBe('run_finished');
  });

  it('se puede cancelar con un AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    const run = await runWorkflow({ prompt: PROMPT, maxIterations: 3, provider: new DemoProvider(), signal: controller.signal });
    expect(run.status).toBe('error');
    expect(run.error).toMatch(/cancelada/);
  });
});

describe('runWorkflow · aislamiento del workspace', () => {
  const scripted = (outputs: Parameters<AgentProvider['implement']> extends unknown[] ? Awaited<ReturnType<AgentProvider['implement']>>[] : never): AgentProvider => {
    let call = 0;
    return {
      mode: 'llm',
      label: 'guion',
      plan: async () => ({ rationale: 'x', tasks: [{ title: 'T', description: 'd', acceptanceCriteria: [{ id: 'a', description: 'a', expect: [] }] }] }),
      implement: async () => outputs[Math.min(call++, outputs.length - 1)],
      review: async () => ({ results: [{ criterionId: 'a', name: 'a', passed: call >= outputs.length, detail: '' }], feedback: ['[a] repetir'] }),
    };
  };

  it('rechaza rutas peligrosas y no las añade al workspace', async () => {
    const provider = scripted([
      {
        files: [
          { path: '../../etc/passwd', content: 'x' },
          { path: '/abs/file.txt', content: 'x' },
          { path: 'C:\\Windows\\win.ini', content: 'x' },
          { path: 'ok/file.txt', content: 'hola' },
        ],
        notes: '',
      },
    ]);
    const run = await runWorkflow({ prompt: 'probar rutas', maxIterations: 1, provider });
    expect(run.changes.map((c) => c.path)).toEqual(['ok/file.txt']);
    expect(run.logs.filter((l) => /rechazada por seguridad/.test(l.message))).toHaveLength(3);
  });

  it('registra eliminaciones y omite archivos sin cambios', async () => {
    const provider = scripted([
      { files: [{ path: 'a.txt', content: '1' }, { path: 'b.txt', content: '2' }], notes: '' },
      { files: [{ path: 'a.txt', content: '1' }], deleted: ['b.txt', 'no-existe.txt'], notes: '' },
    ]);
    const run = await runWorkflow({ prompt: 'probar borrado', maxIterations: 2, provider });
    expect(run.changes.map((c) => `${c.kind}:${c.path}`)).toEqual(['created:a.txt', 'created:b.txt', 'deleted:b.txt']);
    const deleted = run.changes[2];
    expect(deleted.before).toBe('2');
    expect(deleted.after).toBeNull();
    expect([...buildWorkspace(run.changes).keys()]).toEqual(['a.txt']);
  });
});
