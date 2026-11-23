import { summarizeRun, summarizeThread, type Run, type RunSummary, type Thread, type ThreadSummary } from '../types';
import type { RunRepository, ThreadInfo } from './repository';

/**
 * Repositorio en memoria: se usa cuando Supabase no está configurado.
 * Los datos viven mientras el proceso del servidor siga activo (en Vercel,
 * cada instancia serverless tiene su propia memoria y es efímera).
 */
export class MemoryRunRepository implements RunRepository {
  readonly kind = 'memory' as const;
  private readonly runs = new Map<string, Run>();
  private readonly threads = new Map<string, ThreadInfo>();

  constructor(private readonly capacity = 50) {}

  async saveThread(thread: ThreadInfo): Promise<void> {
    this.threads.set(thread.id, { ...thread });
  }

  async saveRun(run: Run): Promise<void> {
    this.runs.delete(run.id);
    this.runs.set(run.id, structuredClone(run));
    if (!this.threads.has(run.threadId)) {
      this.threads.set(run.threadId, { id: run.threadId, title: run.prompt.slice(0, 120), createdAt: run.createdAt, updatedAt: run.createdAt });
    }
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

  async getThread(id: string): Promise<Thread | null> {
    const info = this.threads.get(id);
    if (!info) return null;
    const runs = [...this.runs.values()]
      .filter((r) => r.threadId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((r) => structuredClone(r));
    return { ...info, runs };
  }

  async listThreads(limit = 30): Promise<ThreadSummary[]> {
    const threads = await Promise.all([...this.threads.keys()].map((id) => this.getThread(id)));
    return threads
      .filter((t): t is Thread => t !== null && t.runs.length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(summarizeThread);
  }

  async setRunDiscarded(runId: string, discarded: boolean): Promise<void> {
    const run = this.runs.get(runId);
    if (run) run.discarded = discarded;
  }
}
