import type {
  AgentProvider,
  ImplementInput,
  ImplementOutput,
  PlanInput,
  PlanOutput,
  ReviewInput,
  ReviewOutput,
} from '../provider';
import { staticReview } from '../provider';
import { findDemoTask, pickDomain, type DemoTask } from './catalog';

const FEEDBACK_ID = /^\[([\w-]+)\]/;

/**
 * Proveedor demo: no usa red ni API keys. Es determinista para que los tests
 * sean reproducibles, pero el ciclo es real: Testing verifica el código que
 * genera Develop y Develop solo corrige lo que Testing le reporta.
 */
export class DemoProvider implements AgentProvider {
  readonly mode = 'demo' as const;
  readonly label = 'Demo determinista (sin coste)';

  async plan({ prompt }: PlanInput): Promise<PlanOutput> {
    const domain = pickDomain(prompt);
    return {
      rationale: `Detecto una petición de tipo «${domain.label}». La divido en ${domain.tasks.length} tareas de desarrollo verificables y una validación de integración final.`,
      tasks: domain.tasks.map((t) => ({
        title: t.title,
        description: t.description,
        acceptanceCriteria: t.criteria.map(({ id, description, expect }) => ({ id, description, expect })),
      })),
    };
  }

  async implement({ task, attempt, feedback }: ImplementInput): Promise<ImplementOutput> {
    const template = findDemoTask(task.title);
    if (!template) {
      // Tarea desconocida (p. ej. planificada por otro proveedor): implementación completa.
      const code = task.acceptanceCriteria.map((c) => `// ${c.description}\n${(c.expect ?? []).join('\n')}`).join('\n\n');
      return { code, notes: 'Implementación genérica generada a partir de los criterios.' };
    }

    const omitted = omittedCriteria(template, attempt, feedback);
    const included = template.criteria.filter((c) => !omitted.has(c.id));
    const fixed = attempt > 1 ? template.criteria.filter((c) => feedbackIds(feedback).has(c.id) && !omitted.has(c.id)) : [];

    const code = renderFile(template, attempt, included.map((c) => c.snippet));
    const notes =
      attempt === 1
        ? `Primera implementación de ${template.file} (${included.length}/${template.criteria.length} criterios cubiertos).`
        : `Corrijo según el feedback de Testing: ${fixed.map((c) => c.id).join(', ') || 'sin cambios'}.` +
          (omitted.size > 0 ? ` Quedan ${omitted.size} puntos pendientes.` : '');
    return { code, notes };
  }

  async review({ task, code }: ReviewInput): Promise<ReviewOutput> {
    return staticReview(code, task.acceptanceCriteria);
  }
}

function feedbackIds(feedback: string[]): Set<string> {
  const ids = new Set<string>();
  for (const line of feedback) {
    const match = FEEDBACK_ID.exec(line);
    if (match) ids.add(match[1]);
  }
  return ids;
}

/**
 * Intento 1: Develop omite los últimos `misses` criterios.
 * Intentos siguientes: corrige UN punto del feedback por iteración (el primero),
 * manteniendo los demás pendientes. Así un límite de iteraciones bajo puede
 * hacer fallar la tarea, igual que ocurriría con un agente real.
 */
function omittedCriteria(template: DemoTask, attempt: number, feedback: string[]): Set<string> {
  if (attempt <= 1) {
    const misses = Math.min(template.misses, template.criteria.length);
    return new Set(template.criteria.slice(template.criteria.length - misses).map((c) => c.id));
  }
  const pending = [...feedbackIds(feedback)].filter((id) => template.criteria.some((c) => c.id === id));
  return new Set(pending.slice(1));
}

function renderFile(template: DemoTask, attempt: number, snippets: string[]): string {
  return [
    `// ${template.file}`,
    `// Tarea: ${template.title}`,
    `// Generado por Develop (modo demo) · intento ${attempt}`,
    '',
    ...snippets,
    '',
  ].join('\n');
}
