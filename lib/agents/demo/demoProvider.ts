import type {
  AgentProvider,
  ArtifactFile,
  ImplementInput,
  ImplementOutput,
  PlanInput,
  PlanOutput,
  ReviewInput,
  ReviewOutput,
} from '../provider';
import { staticReview } from '../provider';
import { findDemoTask, pickDomain, renderTemplate, type DemoDomain, type DemoTask } from './catalog';

const FEEDBACK_ID = /^\[([\w-]+)\]/;

/**
 * Proveedor demo: no usa red ni API keys y es determinista (tests reproducibles).
 *
 * Qué se simula: las decisiones de los agentes (el plan sale de una plantilla y
 * los "olvidos" de Develop en el primer intento están predefinidos).
 * Qué es real: Develop genera archivos completos en el workspace a partir del
 * feedback recibido, y Testing inspecciona esos archivos; si un criterio no se
 * cumple, la prueba falla de verdad y Develop solo corrige lo que se le reporta.
 */
export class DemoProvider implements AgentProvider {
  readonly mode = 'demo' as const;
  readonly label = 'Demo determinista (sin coste)';

  async plan({ prompt }: PlanInput): Promise<PlanOutput> {
    const domain = pickDomain(prompt);
    return {
      rationale: `Detecto una petición de tipo «${domain.label}». La divido en ${domain.tasks.length} tareas de desarrollo con criterios verificables sobre archivos concretos, más una validación de integración final.`,
      tasks: domain.tasks.map((t) => ({
        title: t.title,
        description: t.description,
        acceptanceCriteria: t.criteria.map(({ id, description, file, expect }) => ({ id, description, file, expect })),
      })),
    };
  }

  async implement({ task, attempt, feedback, workspace }: ImplementInput): Promise<ImplementOutput> {
    const found = findDemoTask(task.title);
    if (!found) {
      // Tarea desconocida (p. ej. planificada por otro proveedor): un archivo con lo pedido.
      const path = `tasks/${task.id.slice(0, 8)}.md`;
      const content = task.acceptanceCriteria.map((c) => `- ${c.description}\n${(c.expect ?? []).join('\n')}`).join('\n');
      return { files: [{ path, content }], notes: 'Implementación genérica generada a partir de los criterios.' };
    }
    const { domain, task: template } = found;

    const omitted = omittedCriteria(template, attempt, feedback);
    const own = new Map(template.criteria.map((c) => [c.id, c]));
    const files = renderTaskFiles(domain, template, omitted, workspace);

    const fixed = attempt > 1 ? [...feedbackIds(feedback)].filter((id) => own.has(id) && !omitted.has(id)) : [];
    const covered = template.criteria.length - omitted.size;
    const notes =
      attempt === 1
        ? `Primera versión de ${files.map((f) => f.path).join(', ')}: ${covered}/${template.criteria.length} criterios cubiertos.`
        : `Corrijo según el feedback de Testing (${fixed.join(', ') || 'sin cambios'}).` +
          (omitted.size > 0 ? ` Quedan ${omitted.size} punto(s) pendientes.` : ' Todos los puntos atendidos.');
    return { files, notes };
  }

  async review({ task, files }: ReviewInput): Promise<ReviewOutput> {
    return staticReview(files, task.acceptanceCriteria);
  }
}

/**
 * Renderiza los archivos que toca la tarea. Para los marcadores de criterios de
 * OTRAS tareas que comparten archivo (p. ej. index.html), se conserva lo que ya
 * existe en el workspace: Develop modifica el archivo sin borrar el trabajo previo.
 */
function renderTaskFiles(
  domain: DemoDomain,
  task: DemoTask,
  omitted: Set<string>,
  workspace: Record<string, string>,
): ArtifactFile[] {
  const allCriteria = new Map(domain.tasks.flatMap((t) => t.criteria).map((c) => [c.id, c]));
  const own = new Set(task.criteria.map((c) => c.id));
  const paths = [...new Set(task.criteria.map((c) => c.file))];

  return paths.map((path) => {
    const current = workspace[path] ?? '';
    const content = renderTemplate(domain.templates[path], (id) => {
      const criterion = allCriteria.get(id);
      if (!criterion) return null;
      if (own.has(id)) return omitted.has(id) ? (criterion.fallback ?? null) : criterion.snippet;
      const alreadyThere = criterion.expect.every((fragment) => current.includes(fragment));
      return alreadyThere ? criterion.snippet : null;
    });
    return { path, content };
  });
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
