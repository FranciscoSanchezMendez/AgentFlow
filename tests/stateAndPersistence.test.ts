import { describe, expect, it } from 'vitest';
import { DemoProvider } from '@/lib/agents/demo/demoProvider';
import { applyEvent, initialDashboardState, readNdjson } from '@/lib/client/runState';
import { runWorkflow } from '@/lib/engine/workflow';
import { MemoryRunRepository } from '@/lib/persistence/memoryRepository';
import { streamRun } from '@/lib/server/runService';
import type { Run, WorkflowEvent } from '@/lib/types';

const PROMPT = 'Formulario de contacto con validación';

describe('applyEvent (estado del dashboard)', () => {
  it('reconstruye el mismo run que devuelve el motor', async () => {
    let state = initialDashboardState();
    const final = await runWorkflow({
      prompt: PROMPT,
      maxIterations: 3,
      provider: new DemoProvider(),
      onEvent: (e) => {
        state = applyEvent(state, e);
      },
    });
    expect(state.run?.status).toBe('passed');
    expect(state.run?.tasks.map((t) => t.status)).toEqual(final.tasks.map((t) => t.status));
    expect(state.run?.messages).toHaveLength(final.messages.length);
    expect(state.run?.logs).toHaveLength(final.logs.length);
    expect(state.agents.orchestrator.status).toBe('done');
  });

  it('ignora eventos de tarea si no hay run activo', () => {
    const s = initialDashboardState();
    const next = applyEvent(s, { type: 'log', log: { id: '1', runId: 'r', agent: 'system', level: 'info', message: 'x', createdAt: '' } });
    expect(next).toBe(s);
  });
});

describe('MemoryRunRepository', () => {
  it('guarda, recupera y lista por fecha descendente', async () => {
    const repo = new MemoryRunRepository(2);
    const mk = (id: string, createdAt: string) => ({ ...base(), id, createdAt });
    await repo.saveRun(mk('a', '2026-01-01T00:00:00Z'));
    await repo.saveRun(mk('b', '2026-01-02T00:00:00Z'));
    await repo.saveRun(mk('c', '2026-01-03T00:00:00Z'));

    expect(await repo.getRun('a')).toBeNull(); // capacidad 2: se descarta el más antiguo
    expect((await repo.listRuns()).map((r) => r.id)).toEqual(['c', 'b']);
    const c = await repo.getRun('c');
    expect(c?.id).toBe('c');
  });

  it('devuelve copias (no referencias mutables)', async () => {
    const repo = new MemoryRunRepository();
    const run = base();
    await repo.saveRun(run);
    run.prompt = 'cambiado';
    expect((await repo.getRun(run.id))?.prompt).toBe('Prueba');
  });
});

describe('streamRun (API en streaming)', () => {
  it('emite NDJSON y persiste el run al empezar y al terminar', async () => {
    const repo = new MemoryRunRepository();
    const stream = streamRun({ prompt: PROMPT, maxIterations: 3, provider: new DemoProvider(), repository: repo, stepDelayMs: 0 });
    const events: WorkflowEvent[] = [];
    await readNdjson(stream, (e) => events.push(e));

    const finished = events.at(-1);
    expect(finished?.type).toBe('run_finished');
    const runId = finished?.type === 'run_finished' ? finished.run.id : '';
    const saved = await repo.getRun(runId);
    expect(saved?.status).toBe('passed');
    expect(saved?.tasks).toHaveLength(4);
  });

  it('avisa por el stream si falla la persistencia, sin detener el workflow', async () => {
    const failing = new MemoryRunRepository();
    failing.saveRun = async () => {
      throw new Error('db caída');
    };
    const events: WorkflowEvent[] = [];
    await readNdjson(
      streamRun({ prompt: PROMPT, maxIterations: 3, provider: new DemoProvider(), repository: failing, stepDelayMs: 0 }),
      (e) => events.push(e),
    );
    expect(events.some((e) => e.type === 'log' && e.log.level === 'warn' && /base de datos/.test(e.log.message))).toBe(true);
    const finished = events.find((e) => e.type === 'run_finished');
    expect(finished?.type === 'run_finished' && finished.run.status).toBe('passed');
  });
});

describe('readNdjson', () => {
  it('maneja líneas partidas entre fragmentos', async () => {
    const enc = new TextEncoder();
    const chunks = ['{"type":"error","mess', 'age":"a"}\n{"type":"error",', '"message":"b"}'];
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch));
        c.close();
      },
    });
    const got: WorkflowEvent[] = [];
    await readNdjson(stream, (e) => got.push(e));
    expect(got).toEqual([
      { type: 'error', message: 'a' },
      { type: 'error', message: 'b' },
    ]);
  });
});

function base(): Run {
  return {
    id: 'run-1',
    prompt: 'Prueba',
    status: 'passed',
    mode: 'demo',
    maxIterations: 3,
    totalIterations: 0,
    summary: null,
    error: null,
    createdAt: new Date().toISOString(),
    finishedAt: null,
    tasks: [],
    messages: [],
    logs: [],
    iterations: [],
  };
}
