import { summarizeRun, type Run, type RunSummary } from '../types';
import type { RunRepository } from './repository';

/**
 * Repositorio en memoria: se usa cuando Supabase no está configurado.
 * Los datos viven mientras el proceso del servidor siga activo (en Vercel,
 * cada instancia serverless tiene su propia memoria y es efímera).
 */
export class MemoryRunRepository implements RunRepository {
  readonly kind = 'memory' as const;
  private readonly runs = new Map<string, Run>();

  constructor(private readonly capacity = 50) {}

  async saveRun(run: Run): Promise<void> {
    this.runs.delete(run.id);
    this.runs.set(run.id, structuredClone(run));
    while (this.runs.size > this.capacity) {
      const oldest = this.runs.keys().next().value;
      if (oldest === undefined) break;
      this.runs.delete(oldest);
    }
  }

  async getRun(id: string): Promise<Run | null> {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  async listRuns(limit = 20): Promise<RunSummary[]> {
    return [...this.runs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(summarizeRun);
  }
}
