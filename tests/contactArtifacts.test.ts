/**
 * Comprueba que los artefactos que genera la demo de contacto FUNCIONAN, no solo
 * que contienen ciertos textos: se carga `validation.js` del workspace y se
 * ejecuta `validateContact` con datos reales. (Esto ocurre solo en los tests, con
 * código del catálogo propio; la app nunca ejecuta código generado en el servidor.)
 */
import { describe, expect, it } from 'vitest';
import { CONTACT_DEMO_PROMPT } from '@/lib/agents/demo/catalog';
import { DemoProvider } from '@/lib/agents/demo/demoProvider';
import { runWorkflow } from '@/lib/engine/workflow';
import { buildPreviewDocument, buildWorkspace, snapshotOf } from '@/lib/workspace';
import type { Run } from '@/lib/types';

type Validate = (data: Record<string, string>) => Record<string, string>;

function loadValidate(source: string): Validate {
  return new Function(`${source}\nreturn validateContact;`)() as Validate;
}

const VALID = { name: 'Ana', email: 'ana@example.com', subject: 'Hola', message: 'Quiero información sobre vuestros servicios.' };

async function demoRun(): Promise<Run> {
  return runWorkflow({ prompt: CONTACT_DEMO_PROMPT, maxIterations: 3, provider: new DemoProvider() });
}

describe('artefactos de la demo de contacto', () => {
  it('la versión final de validation.js valida correctamente', async () => {
    const run = await demoRun();
    const validate = loadValidate(buildWorkspace(run.changes).get('validation.js')!.content);

    expect(validate(VALID)).toEqual({});
    expect(Object.keys(validate({ name: '', email: '', subject: '', message: '' })).sort()).toEqual(['email', 'message', 'name', 'subject']);
    expect(validate({ ...VALID, email: 'ana@correo' }).email).toMatch(/válido/);
    expect(validate({ ...VALID, message: 'Hola' }).message).toMatch(/20 caracteres/);
  });

  it('la primera versión tiene el fallo que Testing detecta: acepta emails inválidos', async () => {
    const run = await demoRun();
    const firstVersion = run.changes.find((c) => c.path === 'validation.js' && c.kind === 'created')!;
    const validate = loadValidate(firstVersion.after!);

    expect(validate({ ...VALID, email: 'ana@correo' }).email).toBeUndefined(); // bug real
    expect(validate({ ...VALID, message: 'Hola' }).message).toBeUndefined(); // bug real

    const testing = run.iterations.find((i) => i.taskId === firstVersion.taskId && i.number === 1)!;
    expect(testing.passed).toBe(false);
  });

  it('genera una página completa para la vista previa', async () => {
    const run = await demoRun();
    const doc = buildPreviewDocument(snapshotOf(buildWorkspace(run.changes)))!;
    for (const fragment of ['<form id="contact-form"', 'name="subject"', '@media (max-width: 600px)', 'function validateContact', "addEventListener('submit'", 'form.reset()']) {
      expect(doc).toContain(fragment);
    }
    expect(doc).not.toMatch(/<script src=/); // los scripts locales quedan incrustados
  });

  it('el JavaScript final es sintácticamente válido', async () => {
    const run = await demoRun();
    const ws = buildWorkspace(run.changes);
    for (const path of ['validation.js', 'app.js']) {
      expect(() => new Function(ws.get(path)!.content)).not.toThrow();
    }
  });
});
