'use client';

import { useState } from 'react';
import type { Run, Task } from '@/lib/types';
import { AGENT_META, Badge, TASK_STATUS_LABEL } from './ui';

export function TaskBoard({ run, onOpenFile }: { run: Run | null; onOpenFile: (path: string) => void }) {
  const tasks = run?.tasks ?? [];
  const completed = tasks.filter((t) => t.status === 'completed').length;

  return (
    <section className="card panel" aria-labelledby="tasks-title">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Ejecución</p>
          <h2 id="tasks-title">Tablero de tareas</h2>
        </div>
        {tasks.length > 0 && (
          <span className="muted">
            {completed}/{tasks.length} completadas
          </span>
        )}
      </header>
      {tasks.length > 0 && (
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={completed}>
          <span style={{ width: `${(completed / tasks.length) * 100}%` }} />
        </div>
      )}
      {tasks.length === 0 ? (
        <p className="empty">Las tareas que cree el Orchestrator aparecerán aquí.</p>
      ) : (
        <ol className="tasks">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} run={run!} onOpenFile={onOpenFile} />
          ))}
        </ol>
      )}
    </section>
  );
}

function TaskItem({ task, run, onOpenFile }: { task: Task; run: Run; onOpenFile: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const iterations = run.iterations.filter((i) => i.taskId === task.id);
  const last = iterations.at(-1);
  const meta = AGENT_META[task.assignee];

  return (
    <li className={`task task-${task.status}`}>
      <button type="button" className="task-row" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={`task-marker marker-${task.status}`} aria-hidden>
          {task.status === 'completed' ? '✓' : task.status === 'failed' ? '✕' : task.position + 1}
        </span>
        <span className="task-text">
          <strong>{task.title}</strong>
          <small>
            <span className={`chip tone-${meta.tone}`}>{meta.name}</span>
            {task.reviewer && <span className="chip tone-amber">↳ {AGENT_META[task.reviewer].name}</span>}
            {task.attempts > 0 && task.assignee === 'develop' && (
              <span className="attempts">
                Iteración {task.attempts}/{run.maxIterations}
              </span>
            )}
          </small>
        </span>
        <Badge kind={task.status}>{TASK_STATUS_LABEL[task.status]}</Badge>
        <span className="chevron" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {iterations.length > 0 && (
        <div className="iteration-track" aria-label="Historial de iteraciones">
          {iterations.map((it) => (
            <span key={it.id} className={`iter ${it.passed ? 'iter-pass' : 'iter-fail'}`} title={`Iteración ${it.number}: ${it.passed ? 'superada' : 'con fallos'}`}>
              {it.number}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="task-details">
          <p>{task.description}</p>
          <h4>Criterios de aceptación</h4>
          <ul className="criteria">
            {task.acceptanceCriteria.map((c) => {
              const result = last?.results.find((r) => r.criterionId === c.id);
              const state = result ? (result.passed ? 'pass' : 'fail') : 'pending';
              return (
                <li key={c.id} className={`criterion criterion-${state}`}>
                  <span aria-hidden>{state === 'pass' ? '✓' : state === 'fail' ? '✕' : '○'}</span>
                  <div>
                    {c.description}
                    {c.file && <span className="crit-file">{c.file}</span>}
                    {result && !result.passed && <small>{result.detail}</small>}
                  </div>
                </li>
              );
            })}
          </ul>
          {task.files.length > 0 && (
            <>
              <h4>Archivos de esta tarea</h4>
              <div className="task-files">
                {task.files.map((path) => {
                  const kinds = run.changes.filter((c) => c.taskId === task.id && c.path === path);
                  const label = kinds[0]?.kind === 'created' ? 'nuevo' : kinds[0]?.kind === 'deleted' ? 'eliminado' : 'modificado';
                  return (
                    <button key={path} type="button" className="file-chip" onClick={() => onOpenFile(path)} title="Abrir en el Workspace">
                      {path} <small>· {label} · {kinds.length} cambio(s)</small>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
