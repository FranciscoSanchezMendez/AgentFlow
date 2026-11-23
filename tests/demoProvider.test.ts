import { describe, expect, it } from 'vitest';
import { DEMO_DOMAINS, pickDomain } from '@/lib/agents/demo/catalog';
import { DemoProvider } from '@/lib/agents/demo/demoProvider';
import { staticReview } from '@/lib/agents/provider';
import { createProvider } from '@/lib/agents/factory';
import { readConfig } from '@/lib/config';

describe('DemoProvider', () => {
  const provider = new DemoProvider();

  it.each([
    ['Formulario de contacto', 'form'],
    ['Crea una API REST de productos', 'api'],
    ['Login de usuarios', 'auth'],
    ['Una lista de tareas', 'generic'],
  ])('elige el dominio adecuado para «%s»', (prompt, domain) => {
    expect(pickDomain(prompt).id).toBe(domain);
  });

  it('genera tareas con criterios verificables', async () => {
    const plan = await provider.plan({ prompt: 'Crea una API REST' });
    expect(plan.tasks.length).toBeGreaterThan(0);
    for (const t of plan.tasks) {
      expect(t.acceptanceCriteria.length).toBeGreaterThan(0);
      for (const c of t.acceptanceCriteria) expect(c.expect?.length).toBeGreaterThan(0);
    }
  });

  // Garantiza la coherencia del catálogo: con todos los fragmentos, cada tarea pasa.
  it.each(DEMO_DOMAINS.flatMap((d) => d.tasks.map((t) => [d.id, t] as const)))('catálogo %s: «%s» es satisfacible', (_d, task) => {
    const code = task.criteria.map((c) => c.snippet).join('\n');
    const review = staticReview(code, task.criteria);
    expect(review.results.every((r) => r.passed)).toBe(true);
  });

  it.each(DEMO_DOMAINS.flatMap((d) => d.tasks.filter((t) => t.misses > 0).map((t) => [t.title, t] as const)))(
    'catálogo: omitir criterios en «%s» hace fallar exactamente esos criterios',
    (_title, task) => {
      const kept = task.criteria.slice(0, task.criteria.length - task.misses);
      const review = staticReview(kept.map((c) => c.snippet).join('\n'), task.criteria);
      expect(review.results.filter((r) => !r.passed)).toHaveLength(task.misses);
    },
  );

  it('es determinista', async () => {
    const plan = await provider.plan({ prompt: 'formulario' });
    const task = { ...plan.tasks[1], id: 'x' };
    const a = await provider.implement({ prompt: 'formulario', task, attempt: 1, feedback: [] });
    const b = await provider.implement({ prompt: 'formulario', task, attempt: 1, feedback: [] });
    expect(a.code).toBe(b.code);
  });
});

describe('staticReview', () => {
  it('detecta fragmentos ausentes y genera feedback con el id del criterio', () => {
    const review = staticReview('const a = 1;', [
      { id: 'ok', description: 'Declara a', expect: ['const a'] },
      { id: 'ko', description: 'Declara b', expect: ['const b'] },
    ]);
    expect(review.results.map((r) => r.passed)).toEqual([true, false]);
    expect(review.feedback).toHaveLength(1);
    expect(review.feedback[0]).toMatch(/^\[ko\]/);
  });
});

describe('createProvider', () => {
  it('usa el modo demo por defecto', () => {
    expect(createProvider(readConfig({})).mode).toBe('demo');
  });

  it('usa el modo demo si se pide LLM sin API key', () => {
    expect(createProvider(readConfig({ AGENTFLOW_MODE: 'llm' })).mode).toBe('demo');
  });

  it('usa el proveedor LLM solo con modo llm y API key', () => {
    const p = createProvider(readConfig({ AGENTFLOW_MODE: 'llm', ANTHROPIC_API_KEY: 'clave-de-prueba' }));
    expect(p.mode).toBe('llm');
  });
});
