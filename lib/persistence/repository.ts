import type { Run, RunSummary } from '../types';

export interface RunRepository {
  readonly kind: 'supabase' | 'memory';
  saveRun(run: Run): Promise<void>;
  getRun(id: string): Promise<Run | null>;
  listRuns(limit?: number): Promise<RunSummary[]>;
}
