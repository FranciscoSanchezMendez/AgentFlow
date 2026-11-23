import { describe, expect, it } from 'vitest';
import { DemoProvider } from '@/lib/agents/demo/demoProvider';
import type { AgentProvider } from '@/lib/agents/provider';
import { runWorkflow } from '@/lib/engine/workflow';
import type { WorkflowEvent } from '@/lib/types';

const FORM_PROMPT = 'Añade una página de contacto con formulario y validación.';

describe('runWorkflow (modo demo)', () => {
  it('completa todas las tareas con el límite por defecto (3 iteraciones)', async () => {
    const run = await runWorkflow({ prompt: FORM_PROMPT, maxIterations: 3, provider: new DemoProvider() });

    expect(run.status).toBe('passed');
    expect(run.error).toBeNull();
    expect(run.tasks.every((t) => t.status === 'completed')).toBe(true);
    // 3 tareas de desarrollo + 1 de integración
    expect(run.tasks).toHaveLength(4);
    expect(run.tasks.at(-1)?.assignee).toBe('testing');
    // Tarea 1: 1 intento; tarea 2: 3 intentos; tarea 3: 2 intentos
    expect(run.tasks.slice(0, 3).map((t) => t.attempts)).toEqual([1, 3, 2]);
    expect(run.totalIterations).toBe(6);
    expect(run.finishedAt).not.toBeNull();
  });

  it('Testing devuelve feedback y Develop corrige en la siguiente iteración', async () => {
    const run = await runWorkflow({ prompt: FORM_PROMPT, maxIterations: 3, provider: new DemoProvider() });
    const validation = run.tasks[1];
    const its = run.iterations.filter((i) => i.taskId === validation.id);

    expect(its.map((i) => i.passed)).toEqual([false, false, true]);
    expect(its[0].results.filter((r) => !r.passed)).toHaveLength(2);
    expect(its[1].results.filter((r) => !r.passed)).toHaveLength(1);

    const kinds = run.messages.filter((m) => m.taskId === validation.id).map((m) => m.kind);
    expect(kinds).toEqual(['assignment', 'implementation', 'feedback', 'implementation', 'feedback', 'implementation', 'approval']);
    expect(validation.code).toContain('EMAIL_PATTERN.test(');
  });

  it('respeta el límite de iteraciones y marca la tarea como fallida', async () => {
    const run = await runWorkflow({ prompt: FORM_PROMPT, maxIterations: 2, provider: new DemoProvider() });

    expect(run.status).toBe('failed');
    expect(run.tasks[1].status).toBe('failed');
    expect(run.tasks[1].attempts).toBe(2);
    expect(run.tasks[1].feedback.length).toBeGreaterThan(0);
    expect(run.tasks.at(-1)?.status).toBe('failed'); // integración
    expect(run.messages.some((m) => m.kind === 'escalation' && m.to === 'orchestrator')).toBe(true);
    // Nunca supera el límite en ninguna tarea
    for (const task of run.tasks) expect(task.attempts).toBeLessThanOrEqual(2);
  });

  it('con 1 iteración solo pasa la tarea que se implementa bien a la primera', async () => {
    const run = await runWorkflow({ prompt: FORM_PROMPT, maxIterations: 1, provider: new DemoProvider() });
    expect(run.tasks.slice(0, 3).map((t) => t.status)).toEqual(['completed', 'failed', 'failed']);
    expect(run.totalIterations).toBe(3);
  });

  it('emite eventos en orden: run_started primero y run_finished al final', async () => {
    const events: WorkflowEvent[] = [];
    await runWorkflow({ prompt: FORM_PROMPT, maxIterations: 3, provider: new DemoProvider(), onEvent: (e) => void events.push(e) });

    expect(events[0].type).toBe('run_started');
    expect(events.at(-1)?.type).toBe('run_finished');
    const types = new Set(events.map((e) => e.type));
    for (const t of ['agent_status', 'task_created', 'task_updated', 'message', 'log', 'iteration']) expect(types.has(t as WorkflowEvent['type'])).toBe(true);
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
    const run = await runWorkflow({ prompt: FORM_PROMPT, maxIterations: 3, provider: new DemoProvider(), signal: controller.signal });
    expect(run.status).toBe('error');
    expect(run.error).toMatch(/cancelada/);
  });
});
