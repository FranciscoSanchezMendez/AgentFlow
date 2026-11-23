import type { RunSummary } from '@/lib/types';
import { Badge, RUN_STATUS_LABEL, formatDate } from './ui';

interface Props {
  runs: RunSummary[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  persistence: 'supabase' | 'memory' | null;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  disabled: boolean;
}

export function HistoryPanel({ runs, activeId, loading, error, persistence, onSelect, onRefresh, disabled }: Props) {
  return (
    <aside className="card panel history" aria-labelledby="history-title">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Historial</p>
          <h2 id="history-title">Ejecuciones</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onRefresh} disabled={loading} aria-label="Actualizar historial" title="Actualizar">
          ↻
        </button>
      </header>
      {persistence === 'memory' && (
        <p className="note">Sin Supabase configurado: el historial se guarda en memoria del servidor y se pierde al reiniciar.</p>
      )}
      {error && <p className="note note-error">{error}</p>}
      {runs.length === 0 && !loading && !error ? (
        <p className="empty">Todavía no hay ejecuciones.</p>
      ) : (
        <ul className="history-list scroll">
          {runs.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={`history-item ${activeId === r.id ? 'is-active' : ''}`}
                onClick={() => onSelect(r.id)}
                disabled={disabled}
              >
                <span className="history-prompt">{r.prompt}</span>
                <span className="history-meta">
                  <Badge kind={r.status}>{RUN_STATUS_LABEL[r.status]}</Badge>
                  <span>
                    {r.completedTasks}/{r.taskCount} tareas · {r.totalIterations} it.
                  </span>
                </span>
                <time dateTime={r.createdAt}>{formatDate(r.createdAt)}</time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
