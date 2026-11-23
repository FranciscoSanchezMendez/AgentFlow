import type { AgentId, AgentStatus, Run, WorkflowEvent } from '../types';

export interface AgentView {
  status: AgentStatus;
  activity: string;
}

export interface DashboardState {
  run: Run | null;
  agents: Record<AgentId, AgentView>;
  error: string | null;
}

export const idleAgents = (): Record<AgentId, AgentView> => ({
  orchestrator: { status: 'idle', activity: 'Esperando una petición' },
  develop: { status: 'idle', activity: 'En espera' },
  testing: { status: 'idle', activity: 'En espera' },
});

export const initialDashboardState = (): DashboardState => ({ run: null, agents: idleAgents(), error: null });

/** Estado de los agentes deducido de un run ya terminado (al abrirlo desde el historial). */
export function agentsFromRun(run: Run): Record<AgentId, AgentView> {
  if (run.status === 'running') return idleAgents();
  const s: AgentStatus = run.status === 'error' ? 'error' : 'done';
  const ok = run.status === 'passed';
  return {
    orchestrator: { status: s, activity: ok ? 'Workflow completado' : run.status === 'error' ? 'Ejecución interrumpida' : 'Workflow con fallos' },
    develop: { status: s, activity: run.status === 'error' ? 'Ejecución interrumpida' : 'Trabajo entregado' },
    testing: { status: s, activity: ok ? 'Pruebas superadas' : run.status === 'error' ? 'Ejecución interrumpida' : 'Pruebas con fallos' },
  };
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const copy = list.slice();
  copy[idx] = item;
  return copy;
}

/** Reductor puro que aplica un evento del stream al estado del dashboard. */
export function applyEvent(state: DashboardState, event: WorkflowEvent): DashboardState {
  switch (event.type) {
    case 'run_started':
      return { run: event.run, agents: idleAgents(), error: null };
    case 'run_finished':
      return { ...state, run: event.run };
    case 'error':
      return { ...state, error: event.message };
    case 'agent_status':
      return { ...state, agents: { ...state.agents, [event.agent]: { status: event.status, activity: event.activity } } };
  }

  const run = state.run;
  if (!run) return state;
  switch (event.type) {
    case 'task_created':
    case 'task_updated':
      return { ...state, run: { ...run, tasks: upsert(run.tasks, event.task).sort((a, b) => a.position - b.position) } };
    case 'message':
      return { ...state, run: { ...run, messages: [...run.messages, event.message] } };
    case 'log':
      return { ...state, run: { ...run, logs: [...run.logs, event.log] } };
    case 'iteration':
      return {
        ...state,
        run: {
          ...run,
          iterations: [...run.iterations, event.iteration],
          totalIterations: run.tasks.some((t) => t.id === event.iteration.taskId && t.assignee === 'develop')
            ? run.totalIterations + 1
            : run.totalIterations,
        },
      };
    default:
      return state;
  }
}

/** Lee un stream NDJSON y entrega cada evento parseado. */
export async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: WorkflowEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onEvent(JSON.parse(line) as WorkflowEvent);
    }
  }
  const rest = buffer.trim();
  if (rest) onEvent(JSON.parse(rest) as WorkflowEvent);
}
