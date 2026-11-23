'use client';

import { useMemo, useState } from 'react';
import type { Thread } from '@/lib/types';
import { buildWorkspace } from '@/lib/workspace';
import { Badge, RUN_STATUS_LABEL, formatDate } from './ui';

interface Props {
  thread: Thread;
  currentRunId: string | null;
  running: boolean;
  discarding: boolean;
  onSelectRun: (runId: string) => void;
  onDiscard: (runId: string) => void;
}

/** Cabecera del hilo activo: sus implementaciones, la memoria del workspace y descartar. */
export function ThreadBar({ thread, currentRunId, running, discarding, onSelectRun, onDiscard }: Props) {
  const [confirming, setConfirming] = useState(false);
  const active = thread.runs.filter((r) => !r.discarded);
  const latest = active.at(-1);
  const fileCount = useMemo(() => buildWorkspace(active.flatMap((r) => r.changes)).size, [active]);

  return (
    <section className="card thread-bar" aria-labelledby="thread-title">
      <div className="thread-head">
        <div>
          <p className="eyebrow">Hilo de desarrollo</p>
          <h2 id="thread-title">{thread.title}</h2>
          <p className="muted">
            {active.length} implementación(es) activa(s)
            {thread.runs.length > active.length ? ` · ${thread.runs.length - active.length} descartada(s)` : ''} · memoria del workspace:{' '}
            {fileCount} archivo(s) · actualizado {formatDate(thread.updatedAt)}
          </p>
        </div>
        {latest && !running && !confirming && (
          <button type="button" className="btn btn-ghost danger" onClick={() => setConfirming(true)} disabled={discarding}>
            ↶ Descartar última implementación
          </button>
        )}
      </div>

      {confirming && latest && (
        <div className="thread-confirm" role="alertdialog" aria-labelledby="discard-question">
          <p id="discard-question">
            ¿Descartar <strong>#{thread.runs.indexOf(latest) + 1}</strong> «{latest.prompt}»? Sus cambios dejarán de formar parte del workspace
            del hilo. Seguirá visible en el historial como descartada.
          </p>
          <div className="thread-confirm-actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={discarding}
              onClick={() => {
                onDiscard(latest.id);
                setConfirming(false);
              }}
            >
              {discarding ? 'Descartando…' : 'Sí, descartar'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <ol className="thread-runs" aria-label="Implementaciones del hilo">
        {thread.runs.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              className={`thread-run ${r.id === currentRunId ? 'is-on' : ''} ${r.discarded ? 'is-discarded' : ''}`}
              onClick={() => onSelectRun(r.id)}
              disabled={running}
              aria-current={r.id === currentRunId}
              title={r.prompt}
            >
              <span className="thread-run-no">#{i + 1}</span>
              <span className="thread-run-prompt">{r.prompt}</span>
              <span className="thread-run-meta">
                {r.discarded ? <Badge kind="discarded">Descartada</Badge> : <Badge kind={r.status}>{RUN_STATUS_LABEL[r.status]}</Badge>}
                <span>{r.changes.length} cambio(s)</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
