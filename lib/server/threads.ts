import type { RunRepository } from '../persistence/repository';
import { activeRunsBefore, type AcceptanceCriterion, type Run, type Thread } from '../types';
import { buildWorkspace, snapshotOf } from '../workspace';

/** Una implementación «en curso» se considera abandonada pasado este tiempo. */
const STALE_RUN_MS = 10 * 60 * 1000;

export interface ThreadContext {
  /** Workspace resultante de las implementaciones activas del hilo. */
  initialWorkspace: Record<string, string>;
  /** Peticiones de las implementaciones activas, en orden. */
  history: string[];
  /** Criterios de las tareas ya aprobadas, para comprobar que nada se rompe. */
  regressionCriteria: AcceptanceCriterion[];
}

/** Memoria del hilo que recibe la siguiente implementación. */
export function threadContext(thread: Pick<Thread, 'runs'>): ThreadContext {
  const active = activeRunsBefore(thread);
  return {
    initialWorkspace: snapshotOf(buildWorkspace(active.flatMap((r) => r.changes))),
    history: active.map((r) => r.prompt),
    regressionCriteria: active.flatMap((r) =>
      r.tasks.filter((t) => t.assignee === 'develop' && t.status === 'completed').flatMap((t) => t.acceptanceCriteria),
    ),
  };
}

/** ¿Hay una implementación en marcha en el hilo? */
export function isThreadBusy(thread: Pick<Thread, 'runs'>, now = Date.now()): boolean {
  return thread.runs.some(
    (r) => r.status === 'running' && !r.discarded && now - new Date(r.createdAt).getTime() < STALE_RUN_MS,
  );
}

export type DiscardResult = { ok: true; run: Run; thread: Thread } | { ok: false; status: number; error: string };

/**
 * Descarta la última implementación activa del hilo: sus cambios dejan de formar
 * parte del workspace, pero sigue visible en el historial. Solo se permite la
 * última para no romper las implementaciones construidas encima.
 */
export async function discardLatestRun(repository: RunRepository, threadId: string, runId?: string): Promise<DiscardResult> {
  const thread = await repository.getThread(threadId);
  if (!thread) return { ok: false, status: 404, error: 'Hilo no encontrado.' };
  const latest = [...thread.runs].reverse().find((r) => !r.discarded);
  if (!latest) return { ok: false, status: 409, error: 'El hilo no tiene implementaciones activas que descartar.' };
  if (latest.status === 'running' && isThreadBusy(thread)) {
    return { ok: false, status: 409, error: 'No se puede descartar una implementación que sigue en curso.' };
  }
  if (runId && runId !== latest.id) {
    return { ok: false, status: 409, error: 'Solo se puede descartar la última implementación activa del hilo.' };
  }
  await repository.setRunDiscarded(latest.id, true);
  await repository.saveThread({ id: thread.id, title: thread.title, createdAt: thread.createdAt, updatedAt: new Date().toISOString() });
  const updated = (await repository.getThread(threadId))!;
  return { ok: true, run: { ...latest, discarded: true }, thread: updated };
}
