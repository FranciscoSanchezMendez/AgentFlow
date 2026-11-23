import { describe, expect, it } from 'vitest';
import { DEMO_DOMAINS, pickDomain, renderTemplate, type DemoDomain } from '@/lib/agents/demo/catalog';
import { DemoProvider } from '@/lib/agents/demo/demoProvider';
import { createProvider } from '@/lib/agents/factory';
import { staticReview } from '@/lib/agents/provider';
import { readConfig } from '@/lib/config';

/** Renderiza todos los archivos de un dominio incluyendo (o no) cada criterio. */
function renderDomain(domain: DemoDomain, include: (id: string) => boolean): Record<string, string> {
  const criteria = new Map(domain.tasks.flatMap((t) => t.criteria).map((c) => [c.id, c]));
  return Object.fromEntries(
    Object.entries(domain.templates).map(([path, tpl]) => [
      path,
      renderTemplate(tpl, (id) => {
        const c = criteria.get(id);
        if (!c) return null;
        return include(id) ? c.snippet : (c.fallback ?? null);
      }),
    ]),
  );
}

describe('DemoProvider', () => {
  const provider = new DemoProvider();

  it.each([
    ['Crear una página de contacto responsive', 'contact'],
    ['Formulario de suscripción', 'contact'],
    ['Crea una API REST de productos', 'api'],
    ['Login de usuarios', 'auth'],
    ['Una lista de tareas', 'generic'],
  ])('elige el dominio adecuado para «%s»', (prompt, domain) => {
    expect(pickDomain(prompt).id).toBe(domain);
  });

  it('genera tareas con criterios verificables asociados a un archivo', async () => {
    const plan = await provider.plan({ prompt: 'Crea una página de contacto' });
    expect(plan.tasks).toHaveLength(3);
    for (const t of plan.tasks) {
      for (const c of t.acceptanceCriteria) {
        expect(c.file).toBeTruthy();
        expect(c.expect?.length).toBeGreaterThan(0);
      }
    }
  });

  // Coherencia del catálogo: con todos los criterios, todo pasa; sin uno, falla exactamente ese.
  it.each(DEMO_DOMAINS.map((d) => [d.id, d] as const))('catálogo «%s»: todos los criterios son satisfacibles', (_id, domain) => {
    const files = renderDomain(domain, () => true);
    const all = domain.tasks.flatMap((t) => t.criteria);
    const review = staticReview(files, all);
    expect(review.results.filter((r) => !r.passed)).toEqual([]);
    expect(Object.values(files).join('\n')).not.toContain('@@');
  });

  it.each(DEMO_DOMAINS.flatMap((d) => d.tasks.flatMap((t) => t.criteria.map((c) => [`${d.id}/${c.id}`, d, c.id] as const))))(
    'catálogo %s: omitirlo hace fallar solo ese criterio (y los anidados en él)',
    (_label, domain, id) => {
      const all = domain.tasks.flatMap((t) => t.criteria);
      const nested = [...(all.find((c) => c.id === id)!.snippet.matchAll(/@@([\w-]+)@@/g))].map((m) => m[1]);
      const files = renderDomain(domain, (cid) => cid !== id);
      const review = staticReview(files, all);
      expect(review.results.filter((r) => !r.passed).map((r) => r.criterionId).sort()).toEqual([id, ...nested].sort());
    },
  );

  it('es determinista', async () => {
    const plan = await provider.plan({ prompt: 'contacto' });
    const task = { ...plan.tasks[1], id: 'x' };
    const a = await provider.implement({ prompt: 'contacto', task, attempt: 1, feedback: [], workspace: {} });
    const b = await provider.implement({ prompt: 'contacto', task, attempt: 1, feedback: [], workspace: {} });
    expect(a.files).toEqual(b.files);
  });

  it('al modificar un archivo compartido conserva el trabajo previo del workspace', async () => {
    const plan = await provider.plan({ prompt: 'contacto' });
    const layout = await provider.implement({ prompt: 'c', task: { ...plan.tasks[0], id: 't1' }, attempt: 1, feedback: [], workspace: {} });
    const ws = Object.fromEntries(layout.files.map((f) => [f.path, f.content]));
    const submit = await provider.implement({ prompt: 'c', task: { ...plan.tasks[2], id: 't3' }, attempt: 2, feedback: ['[app-confirm] x'], workspace: ws });
    const index = submit.files.find((f) => f.path === 'index.html')!.content;
    expect(index).toContain('name="email"');
    expect(index).toContain('<script src="validation.js"></script>');
  });
});

describe('renderTemplate', () => {
  it('respeta la sangría, admite marcadores anidados y elimina los vacíos', () => {
    const tpl = 'a\n  @@x@@\n@@vacio@@\nb\n';
    const out = renderTemplate(tpl, (id) => (id === 'x' ? 'uno\n@@y@@' : id === 'y' ? 'dos' : null));
    expect(out).toBe('a\n  uno\n  dos\nb\n');
  });
});

describe('staticReview', () => {
  it('inspecciona el archivo indicado y explica el motivo del fallo', () => {
    const review = staticReview({ 'a.js': 'const a = 1;' }, [
      { id: 'ok', description: 'Declara a', file: 'a.js', expect: ['const a'] },
      { id: 'ko', description: 'Declara b', file: 'a.js', expect: ['const b'] },
      { id: 'missing', description: 'Existe c.js', file: 'c.js', expect: ['x'] },
    ]);
    expect(review.results.map((r) => r.passed)).toEqual([true, false, false]);
    expect(review.results[1].detail).toContain('a.js');
    expect(review.results[2].detail).toMatch(/no existe/);
    expect(review.feedback.map((f) => f.slice(0, 4))).toEqual(['[ko]', '[mis']);
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
