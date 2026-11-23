import type { ThreadSummary } from '@/lib/types';
import { Badge, RUN_STATUS_LABEL, formatDate } from './ui';

interface Props {
  threads: ThreadSummary[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  persistence: 'supabase' | 'memory' | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRefresh: () => void;
  disabled: boolean;
}

/** Historial organizado en hilos de desarrollo. */
export function HistoryPanel({ threads, activeId, loading, error, persistence, onSelect, onNew, onRefresh, disabled }: Props) {
  return (
    <aside className="card panel history" aria-labelledby="history-title">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Historial</p>
          <h2 id="history-title">Hilos de desarrollo</h2>
        </div>
        <button type="button" className="icon-btn" onClick={onRefresh} disabled={loading} aria-label="Actualizar hilos" title="Actualizar">
          ↻
        </button>
      </header>
      <button type="button" className={`btn btn-ghost new-thread ${activeId === null ? 'is-on' : ''}`} onClick={onNew} disabled={disabled}>
        ＋ Nuevo hilo
      </button>
      {persistence === 'memory' && (
        <p className="note">Sin Supabase configurado: los hilos se guardan en memoria del servidor y se pierden al reiniciar.</p>
      )}
      {error && <p className="note note-error">{error}</p>}
      {threads.length === 0 && !loading && !error ? (
        <p className="empty">Todavía no hay hilos. Escribe una petición para empezar el primero.</p>
      ) : (
        <ul className="history-list scroll">
          {threads.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`history-item ${activeId === t.id ? 'is-active' : ''}`}
                onClick={() => onSelect(t.id)}
                disabled={disabled}
                aria-current={activeId === t.id}
              >
                <span className="history-prompt">{t.title}</span>
                <span className="history-meta">
                  {t.lastStatus && <Badge kind={t.lastStatus}>{RUN_STATUS_LABEL[t.lastStatus]}</Badge>}
                  <span>
                    {t.activeRunCount} implementación(es)
                    {t.runCount > t.activeRunCount ? ` · ${t.runCount - t.activeRunCount} descartada(s)` : ''}
                  </span>
                </span>
                {t.lastPrompt && t.runCount > 1 && <span className="history-last">Última: «{t.lastPrompt}»</span>}
                <time dateTime={t.updatedAt}>{formatDate(t.updatedAt)}</time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
