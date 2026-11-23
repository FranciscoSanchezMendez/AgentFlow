'use client';

import { useEffect, useRef } from 'react';
import type { AgentMessage, Run } from '@/lib/types';
import { AGENT_META, formatTime } from './ui';

const KIND_LABEL: Record<AgentMessage['kind'], string> = {
  plan: 'Plan',
  assignment: 'Asignación',
  implementation: 'Implementación',
  feedback: 'Feedback',
  approval: 'Aprobación',
  escalation: 'Escalado',
  report: 'Informe',
};

export function Conversation({ run }: { run: Run | null }) {
  const messages = run?.messages ?? [];
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <section className="card panel" aria-labelledby="conv-title">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Colaboración</p>
          <h2 id="conv-title">Mensajes entre agentes</h2>
        </div>
        {messages.length > 0 && <span className="muted">{messages.length}</span>}
      </header>
      {messages.length === 0 ? (
        <p className="empty">Aquí verás cómo se comunican los agentes: asignaciones, entregas y feedback.</p>
      ) : (
        <ol className="messages scroll" ref={listRef}>
          {messages.map((m) => {
            const from = AGENT_META[m.from];
            const to = AGENT_META[m.to];
            return (
              <li key={m.id} className={`message kind-${m.kind}`}>
                <div className={`avatar tone-${from.tone}`} aria-hidden>
                  {from.icon}
                </div>
                <div className="bubble">
                  <div className="message-meta">
                    <strong>{from.name}</strong>
                    <span>→ {to.name}</span>
                    <span className={`kind kind-${m.kind}`}>{KIND_LABEL[m.kind]}</span>
                    {m.iteration && <span className="muted">it. {m.iteration}</span>}
                    <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
                  </div>
                  <p>{m.content}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
