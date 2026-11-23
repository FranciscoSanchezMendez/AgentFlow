import type { AgentView } from '@/lib/client/runState';
import { AGENTS, type AgentId, type Run } from '@/lib/types';
import { AGENT_META, AGENT_STATUS_LABEL } from './ui';

const ORDER: AgentId[] = ['orchestrator', 'develop', 'testing'];

export function AgentCards({ agents, run }: { agents: Record<AgentId, AgentView>; run: Run | null }) {
  return (
    <section className="agents" aria-label="Agentes">
      {ORDER.map((id) => {
        const view = agents[id];
        const meta = AGENT_META[id];
        const sent = run?.messages.filter((m) => m.from === id).length ?? 0;
        const assigned = run?.tasks.filter((t) => t.assignee === id).length ?? 0;
        const active = view.status === 'working' || view.status === 'thinking';
        return (
          <article key={id} className={`card agent tone-${meta.tone} ${active ? 'is-active' : ''}`}>
            <div className="agent-head">
              <div className={`agent-icon tone-${meta.tone}`} aria-hidden>
                {meta.icon}
              </div>
              <div className="agent-title">
                <h3>{AGENTS[id].name}</h3>
                <p>{AGENTS[id].role}</p>
              </div>
              <span className={`agent-status status-${view.status}`}>
                <span className="dot" aria-hidden />
                {AGENT_STATUS_LABEL[view.status]}
              </span>
            </div>
            <p className="agent-activity" aria-live="polite">
              {view.activity}
            </p>
            <dl className="agent-stats">
              <div>
                <dt>Mensajes</dt>
                <dd>{sent}</dd>
              </div>
              <div>
                <dt>Tareas</dt>
                <dd>{assigned}</dd>
              </div>
            </dl>
          </article>
        );
      })}
    </section>
  );
}
