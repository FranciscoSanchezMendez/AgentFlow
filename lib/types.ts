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
  /** Archivo del workspace en el que se verifica el criterio (opcional). */
  file?: string;
  /**
   * Fragmentos que deben aparecer en el archivo para que el criterio se considere
   * cumplido. Los usa la verificación estática de Testing.
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
  /** Rutas del workspace creadas, modificadas o eliminadas por esta tarea. */
  files: string[];
  feedback: string[];
  updatedAt: string;
}

export type FileChangeKind = 'created' | 'modified' | 'deleted';

/** Cambio en un archivo del workspace producido por Develop. */
export interface FileChange {
  id: string;
  runId: string;
  taskId: string;
  iteration: number;
  path: string;
  kind: FileChangeKind;
  before: string | null;
  after: string | null;
  createdAt: string;
}

/** Estado de un archivo del workspace en un momento dado. */
export interface WorkspaceFile {
  path: string;
  content: string;
  /** Tipo del primer cambio (created) o del último (modified) que lo dejó en este estado. */
  status: 'created' | 'modified';
  taskId: string;
  iteration: number;
  changeId: string;
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
  /** Archivo inspeccionado para este criterio. */
  file?: string;
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
  /** Hilo de desarrollo al que pertenece la implementación. */
  threadId: string;
  /** Si es true, sus cambios ya no forman parte del workspace del hilo. */
  discarded: boolean;
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
  /** Historial completo de cambios de archivos (el workspace se reconstruye a partir de él). */
  changes: FileChange[];
}

/**
 * Hilo de desarrollo: una sucesión de implementaciones (runs) sobre el mismo
 * workspace. El workspace del hilo es la suma de los cambios de sus runs activos.
 */
export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Implementaciones en orden cronológico. */
  runs: Run[];
}

export interface ThreadSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  activeRunCount: number;
  lastStatus: RunStatus | null;
  lastPrompt: string | null;
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
  | { type: 'file_changed'; change: FileChange }
  | { type: 'message'; message: AgentMessage }
  | { type: 'log'; log: LogEntry }
  | { type: 'iteration'; iteration: Iteration }
  | { type: 'run_finished'; run: Run }
  | { type: 'error'; message: string };

export const AGENTS: Record<AgentId, { name: string; role: string }> = {
  orchestrator: { name: 'Orchestrator', role: 'Planifica, descompone y asigna tareas' },
  develop: { name: 'Develop', role: 'Escribe y corrige los archivos de cada tarea' },
  testing: { name: 'Testing', role: 'Inspecciona los archivos y valida criterios' },
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

/** Implementaciones activas (no descartadas) anteriores a `beforeRunId` (o todas). */
export function activeRunsBefore(thread: Pick<Thread, 'runs'>, beforeRunId?: string): Run[] {
  const out: Run[] = [];
  for (const run of thread.runs) {
    if (run.id === beforeRunId) break;
    if (!run.discarded) out.push(run);
  }
  return out;
}

export function summarizeThread(thread: Thread): ThreadSummary {
  const last = thread.runs.at(-1);
  return {
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    runCount: thread.runs.length,
    activeRunCount: thread.runs.filter((r) => !r.discarded).length,
    lastStatus: last?.status ?? null,
    lastPrompt: last?.prompt ?? null,
  };
}
