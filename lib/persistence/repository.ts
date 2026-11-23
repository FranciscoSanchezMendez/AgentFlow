import type { Run, RunSummary, Thread, ThreadSummary } from '../types';

export type ThreadInfo = Omit<Thread, 'runs'>;

export interface RunRepository {
  readonly kind: 'supabase' | 'memory';
  /** Crea o actualiza los datos del hilo (título y fechas). */
  saveThread(thread: ThreadInfo): Promise<void>;
  saveRun(run: Run): Promise<void>;
  getRun(id: string): Promise<Run | null>;
  listRuns(limit?: number): Promise<RunSummary[]>;
  /** Hilo con todas sus implementaciones completas, en orden cronológico. */
  getThread(id: string): Promise<Thread | null>;
  listThreads(limit?: number): Promise<ThreadSummary[]>;
  setRunDiscarded(runId: string, discarded: boolean): Promise<void>;
}
