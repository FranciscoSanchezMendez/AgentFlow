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
import { fillPlaceholders, findDemoTask, pickDomain, renderTemplate, type DemoDomain, type DemoTask } from './catalog';
import { applyPatch, criterionApplies, fillFollowup, findFollowupTask, pickFollowups, type Followup, type FollowupTask } from './followups';

const SUPPORTED_FOLLOWUPS =
  'calendario para agendar llamadas (con reservas por usuario si hay inicio de sesión), modo oscuro, pie de página, eliminar la sección «Novedades» y registrar algo en «Novedades»';

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

  async plan({ prompt, context }: PlanInput): Promise<PlanOutput> {
    const files = context?.files ?? {};
    const existing = Object.keys(files);
    const followups = pickFollowups(prompt);
    const wantsBooking = followups.some((f) => f.id === 'booking');
    const domain = pickDomain(prompt);

    // Hilo nuevo que pide una aplicación concreta Y el calendario (p. ej. «login que acceda
    // a una reserva de calendario»): primero las tareas de la aplicación y después las del
    // calendario, integradas con ella. Los criterios del calendario se eligen según el
    // workspace previsto tras las tareas de la aplicación.
    if (existing.length === 0 && wantsBooking && domain.id !== 'list') {
      const predicted = predictDomainFiles(domain, prompt);
      const booking = followups.find((f) => f.id === 'booking')!;
      return {
        rationale: `Detecto una petición de tipo «${domain.label}» que además pide un ${booking.label}. Primero construyo la ${domain.label} y después añado el calendario integrado con ella. ${booking.rationale}`,
        tasks: [...domainTasks(domain), ...followupTasks([booking], predicted, prompt)],
      };
    }

    // Hilo con trabajo previo (o agenda desde cero): mejoras incrementales sobre el workspace.
    if (existing.length > 0 || wantsBooking) {
      const previous = context?.history.length ?? 0;
      const intro =
        existing.length > 0
          ? `Este hilo ya tiene ${existing.length} archivo(s) (${existing.join(', ')}) de ${previous} implementación(es) anterior(es).`
          : 'Hilo nuevo.';

      if (followups.length === 0) {
        return {
          outcome: 'unsupported',
          tasks: [],
          rationale: `${intro} En modo demo los agentes no interpretan texto libre: solo saben aplicar estas mejoras con plantilla: ${SUPPORTED_FOLLOWUPS}. Esta petición no encaja con ninguna, así que no se modifica ningún archivo (antes se anotaba en «Novedades», lo que no era una implementación real). Para implementar peticiones libres, activa el modo LLM (AGENTFLOW_MODE=llm y ANTHROPIC_API_KEY).`,
        };
      }

      const tasks = followupTasks(followups, files, prompt);
      const labels = followups.map((f) => f.label).join(' + ');
      if (tasks.length === 0) {
        return { outcome: 'noop', tasks: [], rationale: `${intro} He revisado la petición (${labels}) y el workspace ya está en ese estado: no hay nada que cambiar.` };
      }
      return {
        rationale: `${intro} Trato la petición como ${followups.length > 1 ? 'varias mejoras' : 'una mejora'} sobre ese trabajo (${labels}). ${followups.map((f) => f.rationale).join(' ')}`,
        tasks,
      };
    }

    return {
      rationale: `Detecto una petición de tipo «${domain.label}». La divido en ${domain.tasks.length} tareas de desarrollo con criterios verificables sobre archivos concretos, más una validación de integración final.`,
      tasks: domainTasks(domain),
    };
  }

  async implement({ prompt, task, attempt, feedback, workspace }: ImplementInput): Promise<ImplementOutput> {
    const followup = findFollowupTask(task.title);
    if (followup) {
      // Solo los criterios que el Orchestrator planificó para este workspace.
      const planned = new Set(task.acceptanceCriteria.map((c) => c.id));
      const scoped = { ...followup.task, criteria: followup.task.criteria.filter((c) => planned.has(c.id)) };
      return implementFollowup(scoped, prompt, attempt, feedback, workspace);
    }

    const found = findDemoTask(task.title, prompt);
    if (!found) {
      // Tarea desconocida (p. ej. planificada por otro proveedor): un archivo con lo pedido.
      const path = `tasks/${task.id.slice(0, 8)}.md`;
      const content = task.acceptanceCriteria.map((c) => `- ${c.description}\n${(c.expect ?? []).join('\n')}`).join('\n');
      return { files: [{ path, content }], notes: 'Implementación genérica generada a partir de los criterios.' };
    }
    const { domain, task: template } = found;

    const omitted = omittedCriteria(template, attempt, feedback);
    const own = new Map(template.criteria.map((c) => [c.id, c]));
    const files = renderTaskFiles(domain, template, omitted, workspace).map((f) => ({ ...f, content: fillPlaceholders(f.content, prompt) }));

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
function omittedCriteria(
  template: { misses: number; criteria: { id: string }[] },
  attempt: number,
  feedback: string[],
): Set<string> {
  if (attempt <= 1) {
    const misses = Math.min(template.misses, template.criteria.length);
    return new Set(template.criteria.slice(template.criteria.length - misses).map((c) => c.id));
  }
  const pending = [...feedbackIds(feedback)].filter((id) => template.criteria.some((c) => c.id === id));
  return new Set(pending.slice(1));
}

/**
 * Mejora incremental: aplica los parches de la tarea sobre el workspace actual.
 * Solo devuelve los archivos que realmente cambian.
 */
function implementFollowup(
  task: FollowupTask,
  prompt: string,
  attempt: number,
  feedback: string[],
  workspace: Record<string, string>,
): ImplementOutput {
  const omitted = omittedCriteria(task, attempt, feedback);
  const next: Record<string, string | undefined> = { ...workspace };
  for (const raw of task.criteria) {
    if (omitted.has(raw.id)) continue;
    if (raw.deleteFile) {
      next[raw.file] = undefined;
      continue;
    }
    const criterion = {
      ...raw,
      expect: raw.expect?.map((e) => fillFollowup(e, prompt)),
      snippet: raw.snippet === undefined ? undefined : fillFollowup(raw.snippet, prompt),
    };
    next[criterion.file] = applyPatch(next[criterion.file] ?? '', criterion);
  }
  const files = Object.keys(next)
    .filter((path) => next[path] !== undefined && next[path] !== workspace[path])
    .map((path) => ({ path, content: next[path]! }));
  const deleted = Object.keys(workspace).filter((path) => next[path] === undefined);

  const covered = task.criteria.length - omitted.size;
  const notes =
    files.length === 0 && deleted.length === 0
      ? 'El workspace del hilo ya cumple esta parte; no hace falta modificar archivos.'
      : attempt === 1
        ? `Aplico la mejora sobre los archivos existentes del hilo: ${covered}/${task.criteria.length} criterios cubiertos.`
        : `Corrijo según el feedback de Testing.${omitted.size > 0 ? ` Quedan ${omitted.size} punto(s) pendientes.` : ' Todos los puntos atendidos.'}`;
  return { files, deleted, notes };
}

function domainTasks(domain: DemoDomain): PlanOutput['tasks'] {
  return domain.tasks.map((t) => ({
    title: t.title,
    description: t.description,
    acceptanceCriteria: t.criteria.map(({ id, description, file, expect }) => ({ id, description, file, expect })),
  }));
}

/** Tareas de las mejoras con los criterios que aplican al workspace indicado. */
function followupTasks(followups: Followup[], files: Record<string, string>, prompt: string): PlanOutput['tasks'] {
  return followups.flatMap((f) =>
    f.tasks
      .map((t) => ({
        title: t.title,
        description: t.description,
        acceptanceCriteria: t.criteria
          .filter((c) => criterionApplies(c, files))
          .map(({ id, description, file, expect, absent }) => ({
            id,
            description,
            file,
            expect: expect?.map((e) => fillFollowup(e, prompt)),
            absent,
          })),
      }))
      .filter((t) => t.acceptanceCriteria.length > 0),
  );
}

/** Workspace que dejará un dominio cuando todas sus tareas se completen. */
function predictDomainFiles(domain: DemoDomain, prompt: string): Record<string, string> {
  const criteria = new Map(domain.tasks.flatMap((t) => t.criteria).map((c) => [c.id, c]));
  return Object.fromEntries(
    Object.entries(domain.templates).map(([path, template]) => [
      path,
      fillPlaceholders(renderTemplate(template, (id) => criteria.get(id)?.snippet ?? null), prompt),
    ]),
  );
}
