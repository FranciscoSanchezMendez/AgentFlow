/**
 * Carga la página que genera cada dominio del modo demo en un DOM simulado
 * (jsdom) y ejecuta su batería de pruebas de interacción, la misma que corre en
 * el navegador dentro de la vista previa. Así se garantiza que:
 *  - la versión final de cada página funciona (todas las pruebas pasan), y
 *  - la versión con el fallo que detectó Testing falla de verdad al usarla.
 *
 * (Ejecutar estas páginas aquí es seguro: son plantillas propias del catálogo.
 * En la app, el código generado solo se ejecuta en el iframe aislado del navegador.)
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { CONTACT_DEMO_PROMPT } from '@/lib/agents/demo/catalog';
import { DemoProvider } from '@/lib/agents/demo/demoProvider';
import { PREVIEW_ERROR_CAPTURE_SCRIPT, PREVIEW_TEST_SCRIPT, isPreviewTestMessage, type PreviewTestMessage } from '@/lib/client/previewTests';
import { runWorkflow } from '@/lib/engine/workflow';
import type { Run } from '@/lib/types';
import { buildPreviewDocument, buildWorkspace, snapshotOf, workspaceSteps } from '@/lib/workspace';

const CASES: [suite: string, prompt: string][] = [
  ['contact', CONTACT_DEMO_PROMPT],
  ['login', 'Implementa el login de usuarios con sesión segura'],
  ['calculator', 'Haz una calculadora de propinas'],
  ['dashboard', 'Crea un dashboard con una tabla de ventas'],
  ['api', 'Crea una API REST para gestionar productos'],
  ['landing', 'Crea una landing page para una cafetería con menú y horarios'],
  ['list', 'Construye una lista de tareas con filtros'],
];

async function runPreviewTests(files: Record<string, string>): Promise<PreviewTestMessage> {
  const html = buildPreviewDocument(files, PREVIEW_TEST_SCRIPT, PREVIEW_ERROR_CAPTURE_SCRIPT);
  if (!html) throw new Error('Sin index.html');
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  try {
    return await new Promise<PreviewTestMessage>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Las pruebas no respondieron')), 4000);
      dom.window.addEventListener('message', (event) => {
        if (isPreviewTestMessage(event.data)) {
          clearTimeout(timer);
          resolve(event.data);
        }
      });
    });
  } finally {
    dom.window.close();
  }
}

/** Workspace justo después de la iteración 1 de la última tarea (la que tiene un fallo). */
function lastTaskFirstIteration(run: Run): Record<string, string> {
  const lastTask = run.tasks.filter((t) => t.assignee === 'develop').at(-1)!;
  const step = workspaceSteps(run.changes).find((s) => s.taskId === lastTask.id && s.iteration === 1)!;
  return snapshotOf(buildWorkspace(run.changes, step.upto));
}

describe.each(CASES)('vista previa «%s»', (suite, prompt) => {
  it('la versión final supera todas las pruebas de interacción', async () => {
    const run = await runWorkflow({ prompt, maxIterations: 3, provider: new DemoProvider() });
    expect(run.status).toBe('passed');

    const message = await runPreviewTests(snapshotOf(buildWorkspace(run.changes)));
    expect(message.suite).toBe(suite);
    const failed = message.results.filter((r) => !r.passed);
    expect(failed).toEqual([]);
    expect(message.results.length).toBeGreaterThanOrEqual(4);
  });

  it('la versión que Testing rechazó también falla al usar la página', async () => {
    const run = await runWorkflow({ prompt, maxIterations: 3, provider: new DemoProvider() });
    const lastTask = run.tasks.filter((t) => t.assignee === 'develop').at(-1)!;
    expect(run.iterations.find((i) => i.taskId === lastTask.id && i.number === 1)?.passed).toBe(false);

    const message = await runPreviewTests(lastTaskFirstIteration(run));
    expect(message.results.some((r) => !r.passed)).toBe(true);
  });
});

describe('vista previa · página desconocida', () => {
  it('usa la prueba de humo y detecta errores de JavaScript', async () => {
    const message = await runPreviewTests({
      'index.html': '<html><head></head><body><h1>Hola mundo desde el modelo</h1><button>OK</button><script src="a.js"></script></body></html>',
      'a.js': 'undefinedFunction();',
    });
    expect(message.suite).toBe('smoke');
    const byName = Object.fromEntries(message.results.map((r) => [r.name, r.passed]));
    expect(byName['Tiene un título principal (h1)']).toBe(true);
    expect(byName['Sin errores de JavaScript al cargar']).toBe(false);
  });
});
