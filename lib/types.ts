/**
 * Tipos de dominio compartidos entre el motor de agentes, la API y la interfaz.
 */

export type AgentId = 'orchestrator' | 'develop' | 'testing';

export type AgentStatus = 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error';

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'in_review'
  | 'changes_requested'
  | 'completed'
  | 'failed';

export type RunStatus = 'running' | 'passed' | 'failed' | 'error';

export type RunMode = 'demo' | 'llm';

export interface AcceptanceCriterion {
  id: string;
  description: string;
  /**
   * Fragmentos que deben aparecer en el código para que el criterio se considere
   * cumplido. Solo los usa el Testing determinista (modo demo o verificación estática).
   */
  expect?: string[];
}

export interface Task {
  id: string;
  runId: string;
  position: number;
  title: string;
  description: string;
  assignee: AgentId;
  reviewer?: AgentId;
  status: TaskStatus;
  attempts: number;
  acceptanceCriteria: AcceptanceCriterion[];
  code?: string;
  feedback: string[];
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  runId: string;
  from: AgentId;
  to: AgentId | 'user';
  kind: 'plan' | 'assignment' | 'implementation' | 'feedback' | 'approval' | 'escalation' | 'report';
  content: string;
  taskId?: string;
  iteration?: number;
  createdAt: string;
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  runId: string;
  agent: AgentId | 'system';
  level: LogLevel;
  message: string;
  createdAt: string;
}

export interface TestResult {
  criterionId: string;
  name: string;
  passed: boolean;
  detail: string;
}

export interface Iteration {
  id: string;
  runId: string;
  taskId: string;
  number: number;
  passed: boolean;
  results: TestResult[];
  createdAt: string;
}

export interface Run {
  id: string;
  prompt: string;
  status: RunStatus;
  mode: RunMode;
  maxIterations: number;
  totalIterations: number;
  summary: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  tasks: Task[];
  messages: AgentMessage[];
  logs: LogEntry[];
  iterations: Iteration[];
}

/** Resumen ligero para el historial. */
export interface RunSummary {
  id: string;
  prompt: string;
  status: RunStatus;
  mode: RunMode;
  maxIterations: number;
  totalIterations: number;
  taskCount: number;
  completedTasks: number;
  createdAt: string;
  finishedAt: string | null;
}

export type WorkflowEvent =
  | { type: 'run_started'; run: Run }
  | { type: 'agent_status'; agent: AgentId; status: AgentStatus; activity: string }
  | { type: 'task_created'; task: Task }
  | { type: 'task_updated'; task: Task }
  | { type: 'message'; message: AgentMessage }
  | { type: 'log'; log: LogEntry }
  | { type: 'iteration'; iteration: Iteration }
  | { type: 'run_finished'; run: Run }
  | { type: 'error'; message: string };

export const AGENTS: Record<AgentId, { name: string; role: string }> = {
  orchestrator: { name: 'Orchestrator', role: 'Planifica, descompone y asigna tareas' },
  develop: { name: 'Develop', role: 'Implementa el código de cada tarea' },
  testing: { name: 'Testing', role: 'Verifica, detecta errores y da feedback' },
};

export function summarizeRun(run: Run): RunSummary {
  return {
    id: run.id,
    prompt: run.prompt,
    status: run.status,
    mode: run.mode,
    maxIterations: run.maxIterations,
    totalIterations: run.totalIterations,
    taskCount: run.tasks.length,
    completedTasks: run.tasks.filter((t) => t.status === 'completed').length,
    createdAt: run.createdAt,
    finishedAt: run.finishedAt,
  };
}
