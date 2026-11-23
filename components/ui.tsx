import type { AgentId, AgentStatus, LogLevel, RunStatus, TaskStatus } from '@/lib/types';

export const AGENT_META: Record<AgentId | 'system' | 'user', { name: string; icon: string; tone: string }> = {
  orchestrator: { name: 'Orchestrator', icon: '◈', tone: 'violet' },
  develop: { name: 'Develop', icon: '⌘', tone: 'green' },
  testing: { name: 'Testing', icon: '⌕', tone: 'amber' },
  system: { name: 'Sistema', icon: '●', tone: 'slate' },
  user: { name: 'Usuario', icon: '◉', tone: 'slate' },
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En progreso',
  in_review: 'En revisión',
  changes_requested: 'Cambios pedidos',
  completed: 'Completada',
  failed: 'Fallida',
};

export const RUN_STATUS_LABEL: Record<RunStatus | 'idle', string> = {
  idle: 'Sin ejecutar',
  running: 'En curso',
  passed: 'Superado',
  failed: 'Con fallos',
  error: 'Error',
};

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  idle: 'Inactivo',
  thinking: 'Pensando',
  working: 'Trabajando',
  waiting: 'Esperando',
  done: 'Terminado',
  error: 'Error',
};

export const LOG_LEVEL_LABEL: Record<LogLevel, string> = {
  info: 'INFO',
  success: 'OK',
  warn: 'AVISO',
  error: 'ERROR',
};

export function Badge({ kind, children }: { kind: string; children: React.ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function durationLabel(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 100) / 10;
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}
