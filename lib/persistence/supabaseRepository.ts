import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentMessage, Iteration, LogEntry, Run, RunSummary, Task } from '../types';
import type { RunRepository } from './repository';

/**
 * Persistencia en Supabase (Postgres). Se usa exclusivamente en el servidor con
 * la service role key; las tablas tienen RLS activado sin políticas públicas,
 * de modo que el navegador nunca accede directamente a la base de datos.
 */
export class SupabaseRunRepository implements RunRepository {
  readonly kind = 'supabase' as const;

  constructor(private readonly db: SupabaseClient) {}

  async saveRun(run: Run): Promise<void> {
    await check(
      this.db.from('runs').upsert({
        id: run.id,
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
  }

  async getRun(id: string): Promise<Run | null> {
    const { data: r, error } = await this.db.from('runs').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    if (!r) return null;

    const [tasks, messages, logs, iterations] = await Promise.all([
      this.db.from('tasks').select('*').eq('run_id', id).order('position'),
      this.db.from('agent_messages').select('*').eq('run_id', id).order('created_at'),
      this.db.from('agent_logs').select('*').eq('run_id', id).order('created_at'),
      this.db.from('iterations').select('*').eq('run_id', id).order('created_at'),
    ]);
    for (const res of [tasks, messages, logs, iterations]) {
      if (res.error) throw new Error(`Supabase: ${res.error.message}`);
    }

    return {
      id: r.id,
      prompt: r.prompt,
      status: r.status,
      mode: r.mode,
      maxIterations: r.max_iterations,
      totalIterations: r.total_iterations,
      summary: r.summary,
      error: r.error,
      createdAt: r.created_at,
      finishedAt: r.finished_at,
      tasks: (tasks.data ?? []).map(
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
          code: t.code ?? undefined,
          feedback: t.feedback ?? [],
          updatedAt: t.updated_at,
        }),
      ),
      messages: (messages.data ?? []).map(
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
      logs: (logs.data ?? []).map(
        (l): LogEntry => ({ id: l.id, runId: l.run_id, agent: l.agent, level: l.level, message: l.message, createdAt: l.created_at }),
      ),
      iterations: (iterations.data ?? []).map(
        (i): Iteration => ({ id: i.id, runId: i.run_id, taskId: i.task_id, number: i.number, passed: i.passed, results: i.results ?? [], createdAt: i.created_at }),
      ),
    };
  }

  async listRuns(limit = 20): Promise<RunSummary[]> {
    const { data, error } = await this.db
      .from('runs')
      .select('id,prompt,status,mode,max_iterations,total_iterations,created_at,finished_at,tasks(status)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`Supabase: ${error.message}`);
    return (data ?? []).map((r) => {
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
  code: t.code ?? null,
  feedback: t.feedback,
  updated_at: t.updatedAt,
});

const messageRow = (m: AgentMessage) => ({
  id: m.id,
  run_id: m.runId,
  from_agent: m.from,
  to_agent: m.to,
  kind: m.kind,
  content: m.content,
  task_id: m.taskId ?? null,
  iteration: m.iteration ?? null,
  created_at: m.createdAt,
});

const logRow = (l: LogEntry) => ({
  id: l.id,
  run_id: l.runId,
  agent: l.agent,
  level: l.level,
  message: l.message,
  created_at: l.createdAt,
});

const iterationRow = (i: Iteration) => ({
  id: i.id,
  run_id: i.runId,
  task_id: i.taskId,
  number: i.number,
  passed: i.passed,
  results: i.results,
  created_at: i.createdAt,
});
