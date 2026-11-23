import type { SupabaseClient } from '@supabase/supabase-js';
import {
  summarizeThread,
  type AgentMessage,
  type FileChange,
  type Iteration,
  type LogEntry,
  type Run,
  type RunSummary,
  type Task,
  type Thread,
  type ThreadSummary,
} from '../types';
import type { RunRepository, ThreadInfo } from './repository';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * Persistencia en Supabase (Postgres). Se usa exclusivamente en el servidor con
 * la service role key; las tablas tienen RLS activado sin políticas públicas,
 * de modo que el navegador nunca accede directamente a la base de datos.
 */
export class SupabaseRunRepository implements RunRepository {
  readonly kind = 'supabase' as const;

  constructor(private readonly db: SupabaseClient) {}

  async saveThread(thread: ThreadInfo): Promise<void> {
    await check(
      this.db.from('threads').upsert({
        id: thread.id,
        title: thread.title.slice(0, 120),
        created_at: thread.createdAt,
        updated_at: thread.updatedAt,
      }),
    );
  }

  async saveRun(run: Run): Promise<void> {
    await check(
      this.db.from('runs').upsert({
        id: run.id,
        thread_id: run.threadId,
        discarded: run.discarded,
        prompt: run.prompt,
        status: run.status,
        mode: run.mode,
        max_iterations: run.maxIterations,
        total_iterations: run.totalIterations,
        summary: run.summary,
        error: run.error,
        created_at: run.createdAt,
        finished_at: run.finishedAt,
      }),
    );
    if (run.tasks.length) await check(this.db.from('tasks').upsert(run.tasks.map(taskRow)));
    if (run.messages.length) await check(this.db.from('agent_messages').upsert(run.messages.map(messageRow)));
    if (run.logs.length) await check(this.db.from('agent_logs').upsert(run.logs.map(logRow)));
    if (run.iterations.length) await check(this.db.from('iterations').upsert(run.iterations.map(iterationRow)));
    if (run.changes.length) await check(this.db.from('file_changes').upsert(run.changes.map(changeRow)));
  }

  async getRun(id: string): Promise<Run | null> {
    const { data, error } = await this.db.from('runs').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    if (!data) return null;
    return (await this.loadRuns([data]))[0];
  }

  async listRuns(limit = 20): Promise<RunSummary[]> {
    const { data, error } = await this.db
      .from('runs')
      .select('id,prompt,status,mode,max_iterations,total_iterations,created_at,finished_at,tasks(status)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).map((r: Row) => {
      const tasks = (r.tasks as { status: string }[] | null) ?? [];
      return {
        id: r.id,
        prompt: r.prompt,
        status: r.status,
        mode: r.mode,
        maxIterations: r.max_iterations,
        totalIterations: r.total_iterations,
        taskCount: tasks.length,
        completedTasks: tasks.filter((t) => t.status === 'completed').length,
        createdAt: r.created_at,
        finishedAt: r.finished_at,
      };
    });
  }

  async getThread(id: string): Promise<Thread | null> {
    const { data: t, error } = await this.db.from('threads').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    if (!t) return null;
    const { data: runRows, error: runsError } = await this.db
      .from('runs')
      .select('*')
      .eq('thread_id', id)
      .order('created_at', { ascending: true })
      .limit(50);
    if (runsError) throw new Error(`Supabase: ${runsError.message}`);
    return { id: t.id, title: t.title, createdAt: t.created_at, updatedAt: t.updated_at, runs: await this.loadRuns(runRows ?? []) };
  }

  async listThreads(limit = 30): Promise<ThreadSummary[]> {
    const { data, error } = await this.db
      .from('threads')
      .select('id,title,created_at,updated_at,runs(id,status,discarded,prompt,created_at)')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? [])
      .map((t: Row) => {
        const runs = ((t.runs as Row[] | null) ?? []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        return summarizeThread({
          id: t.id,
          title: t.title,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          runs: runs.map((r) => ({ id: r.id, status: r.status, discarded: !!r.discarded, prompt: r.prompt }) as Run),
        });
      })
      .filter((t) => t.runCount > 0);
  }

  async setRunDiscarded(runId: string, discarded: boolean): Promise<void> {
    await check(this.db.from('runs').update({ discarded }).eq('id', runId));
  }

  /** Carga los datos completos de varias implementaciones con una consulta por tabla. */
  private async loadRuns(rows: Row[]): Promise<Run[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [tasks, messages, logs, iterations, changes] = await Promise.all([
      this.db.from('tasks').select('*').in('run_id', ids).order('position'),
      this.db.from('agent_messages').select('*').in('run_id', ids).order('seq').order('created_at'),
      this.db.from('agent_logs').select('*').in('run_id', ids).order('seq').order('created_at'),
      this.db.from('iterations').select('*').in('run_id', ids).order('seq').order('created_at'),
      this.db.from('file_changes').select('*').in('run_id', ids).order('seq'),
    ]);
    for (const res of [tasks, messages, logs, iterations, changes]) {
      if (res.error) throw new Error(`Supabase: ${res.error.message}`);
    }
    const byRun = (list: Row[] | null) => {
      const map = new Map<string, Row[]>();
      for (const row of list ?? []) map.set(row.run_id, [...(map.get(row.run_id) ?? []), row]);
      return (id: string) => map.get(id) ?? [];
    };
    const tasksOf = byRun(tasks.data);
    const messagesOf = byRun(messages.data);
    const logsOf = byRun(logs.data);
    const iterationsOf = byRun(iterations.data);
    const changesOf = byRun(changes.data);

    return rows.map((r) => ({
      id: r.id,
      threadId: r.thread_id ?? r.id,
      discarded: !!r.discarded,
      prompt: r.prompt,
      status: r.status,
      mode: r.mode,
      maxIterations: r.max_iterations,
      totalIterations: r.total_iterations,
      summary: r.summary,
      error: r.error,
      createdAt: r.created_at,
      finishedAt: r.finished_at,
      tasks: tasksOf(r.id).map(
        (t): Task => ({
          id: t.id,
          runId: t.run_id,
          position: t.position,
          title: t.title,
          description: t.description,
          assignee: t.assignee,
          reviewer: t.reviewer ?? undefined,
          status: t.status,
          attempts: t.attempts,
          acceptanceCriteria: t.acceptance_criteria ?? [],
          files: t.files ?? [],
          feedback: t.feedback ?? [],
          updatedAt: t.updated_at,
        }),
      ),
      messages: messagesOf(r.id).map(
        (m): AgentMessage => ({
          id: m.id,
          runId: m.run_id,
          from: m.from_agent,
          to: m.to_agent,
          kind: m.kind,
          content: m.content,
          taskId: m.task_id ?? undefined,
          iteration: m.iteration ?? undefined,
          createdAt: m.created_at,
        }),
      ),
      logs: logsOf(r.id).map(
        (l): LogEntry => ({ id: l.id, runId: l.run_id, agent: l.agent, level: l.level, message: l.message, createdAt: l.created_at }),
      ),
      changes: changesOf(r.id).map(
        (c): FileChange => ({
          id: c.id,
          runId: c.run_id,
          taskId: c.task_id,
          iteration: c.iteration,
          path: c.path,
          kind: c.kind,
          before: c.before_content,
          after: c.after_content,
          createdAt: c.created_at,
        }),
      ),
      iterations: iterationsOf(r.id).map(
        (i): Iteration => ({ id: i.id, runId: i.run_id, taskId: i.task_id, number: i.number, passed: i.passed, results: i.results ?? [], createdAt: i.created_at }),
      ),
    }));
  }
}

async function check(query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);
}

const taskRow = (t: Task) => ({
  id: t.id,
  run_id: t.runId,
  position: t.position,
  title: t.title,
  description: t.description,
  assignee: t.assignee,
  reviewer: t.reviewer ?? null,
  status: t.status,
  attempts: t.attempts,
  acceptance_criteria: t.acceptanceCriteria,
  files: t.files,
  feedback: t.feedback,
  updated_at: t.updatedAt,
});

const messageRow = (m: AgentMessage, seq: number) => ({
  id: m.id,
  run_id: m.runId,
  seq,
  from_agent: m.from,
  to_agent: m.to,
  kind: m.kind,
  content: m.content,
  task_id: m.taskId ?? null,
  iteration: m.iteration ?? null,
  created_at: m.createdAt,
});

const logRow = (l: LogEntry, seq: number) => ({
  id: l.id,
  run_id: l.runId,
  seq,
  agent: l.agent,
  level: l.level,
  message: l.message,
  created_at: l.createdAt,
});

const iterationRow = (i: Iteration, seq: number) => ({
  id: i.id,
  run_id: i.runId,
  seq,
  task_id: i.taskId,
  number: i.number,
  passed: i.passed,
  results: i.results,
  created_at: i.createdAt,
});

const changeRow = (c: FileChange, seq: number) => ({
  id: c.id,
  run_id: c.runId,
  task_id: c.taskId,
  seq,
  iteration: c.iteration,
  path: c.path,
  kind: c.kind,
  before_content: c.before,
  after_content: c.after,
  created_at: c.createdAt,
});
