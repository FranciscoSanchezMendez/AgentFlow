'use client';

import { useEffect, useRef, useState } from 'react';
import type { LogEntry, Run } from '@/lib/types';
import { AGENT_META, LOG_LEVEL_LABEL, formatTime } from './ui';

type Filter = 'all' | LogEntry['agent'];
const FILTERS: Filter[] = ['all', 'orchestrator', 'develop', 'testing', 'system'];

export function ActivityLog({ run }: { run: Run | null }) {
  const [filter, setFilter] = useState<Filter>('all');
  const logs = (run?.logs ?? []).filter((l) => filter === 'all' || l.agent === filter);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  return (
    <section className="card panel" aria-labelledby="log-title">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Actividad</p>
          <h2 id="log-title">Logs</h2>
        </div>
        <div className="filters" role="group" aria-label="Filtrar logs por agente">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`filter ${filter === f ? 'is-on' : ''}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
              {f === 'all' ? 'Todos' : AGENT_META[f].name}
            </button>
          ))}
        </div>
      </header>
      {logs.length === 0 ? (
        <p className="empty">Sin actividad registrada.</p>
      ) : (
        <ol className="logs scroll" ref={listRef}>
          {logs.map((l) => (
            <li key={l.id} className={`log level-${l.level}`}>
              <time dateTime={l.createdAt}>{formatTime(l.createdAt)}</time>
              <span className={`log-level level-${l.level}`}>{LOG_LEVEL_LABEL[l.level]}</span>
              <span className={`log-agent tone-${AGENT_META[l.agent].tone}`}>{AGENT_META[l.agent].name}</span>
              <span className="log-message">{l.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
