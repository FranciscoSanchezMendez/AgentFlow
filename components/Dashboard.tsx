'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { agentsFromRun, applyEvent, initialDashboardState, readNdjson, type DashboardState } from '@/lib/client/runState';
import type { Run, RunSummary, WorkflowEvent } from '@/lib/types';
import { ActivityLog } from './ActivityLog';
import { AgentCards } from './AgentCards';
import { Conversation } from './Conversation';
import { HistoryPanel } from './HistoryPanel';
import { TaskBoard } from './TaskBoard';
import { Badge, RUN_STATUS_LABEL, durationLabel } from './ui';

interface Health {
  mode: 'demo' | 'llm';
  provider: string;
  persistence: 'supabase' | 'memory';
  llmRequestedWithoutKey: boolean;
  limits: { minIterations: number; maxIterations: number; defaultIterations: number; promptMaxLength: number };
}

const EXAMPLES = [
  'Añade una página de contacto con formulario y validación.',
  'Crea una API REST para gestionar productos.',
  'Implementa el login de usuarios con sesión segura.',
  'Construye una lista de tareas con filtros.',
];

type Action = { type: 'event'; event: WorkflowEvent } | { type: 'load'; run: Run } | { type: 'error'; message: string } | { type: 'reset' };

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case 'event':
      return applyEvent(state, action.event);
    case 'load':
      return { run: action.run, agents: agentsFromRun(action.run), error: null };
    case 'error':
      return { ...state, error: action.message };
    case 'reset':
      return initialDashboardState();
  }
}

export function Dashboard() {
  const [state, dispatch] = useReducer(reducer, undefined, initialDashboardState);
  const [prompt, setPrompt] = useState(EXAMPLES[0]);
  const [maxIterations, setMaxIterations] = useState(3);
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [, forceTick] = useState(0);

  const limits = health?.limits ?? { minIterations: 1, maxIterations: 10, defaultIterations: 3, promptMaxLength: 2000 };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await fetch('/api/runs', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al cargar el historial');
      setHistory(data.runs);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Error al cargar el historial');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((h: Health) => {
        setHealth(h);
        setMaxIterations(h.limits.defaultIterations);
      })
      .catch(() => setHealth(null));
    void loadHistory();
  }, [loadHistory]);

  // Refresca el cronómetro mientras hay una ejecución en curso.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [running]);

  async function start() {
    if (running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    dispatch({ type: 'reset' });
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxIterations }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      await readNdjson(res.body, (event) => dispatch({ type: 'event', event }));
    } catch (e) {
      if (controller.signal.aborted) dispatch({ type: 'error', message: 'Ejecución cancelada por el usuario.' });
      else dispatch({ type: 'error', message: e instanceof Error ? e.message : 'No se pudo ejecutar el workflow.' });
    } finally {
      setRunning(false);
      abortRef.current = null;
      void loadHistory();
    }
  }

  async function openRun(id: string) {
    try {
      const res = await fetch(`/api/runs/${id}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar la ejecución');
      dispatch({ type: 'load', run: data.run });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      dispatch({ type: 'error', message: e instanceof Error ? e.message : 'No se pudo cargar la ejecución' });
    }
  }

  const { run, agents, error } = state;
  const runStatus = run?.status ?? 'idle';
  const devTasks = run?.tasks.filter((t) => t.assignee === 'develop') ?? [];
  const tooLong = prompt.length > limits.promptMaxLength;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="logo" aria-hidden>
            ✳
          </div>
          <div>
            <h1>AgentFlow</h1>
            <small>Equipo multiagente de desarrollo</small>
          </div>
        </div>
        <div className="pills">
          <span className={`pill ${health?.mode === 'llm' ? 'pill-llm' : 'pill-demo'}`} title={health?.provider}>
            <span className="dot" aria-hidden />
            {health ? (health.mode === 'llm' ? `Modo LLM · ${health.provider.replace('Anthropic · ', '')}` : 'Modo demo · sin API keys') : 'Conectando…'}
          </span>
          {health && (
            <span className="pill" title="Persistencia">
              {health.persistence === 'supabase' ? '⛁ Supabase' : '⛁ Memoria local'}
            </span>
          )}
        </div>
      </header>

      {health?.llmRequestedWithoutKey && (
        <p className="banner">Se pidió el modo LLM pero no hay ANTHROPIC_API_KEY en el servidor: se usa el modo demo.</p>
      )}

      <div className="layout">
        <main className="main">
          <section className="card request" aria-labelledby="request-title">
            <div className="request-head">
              <div>
                <p className="eyebrow">Nueva ejecución</p>
                <h2 id="request-title">¿Qué quieres construir?</h2>
              </div>
            </div>
            <label htmlFor="prompt" className="sr-only">
              Petición para el equipo de agentes
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe una tarea de desarrollo…"
              maxLength={limits.promptMaxLength + 100}
              disabled={running}
              rows={3}
            />
            <div className="examples" aria-label="Ejemplos">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="example" onClick={() => setPrompt(ex)} disabled={running}>
                  {ex}
                </button>
              ))}
            </div>
            <div className="request-actions">
              <label className="iterations" htmlFor="iterations">
                <span>
                  Máx. iteraciones por tarea: <strong>{maxIterations}</strong>
                </span>
                <input
                  id="iterations"
                  type="range"
                  min={limits.minIterations}
                  max={limits.maxIterations}
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(Number(e.target.value))}
                  disabled={running}
                />
              </label>
              <span className={`counter ${tooLong ? 'is-over' : ''}`}>
                {prompt.length}/{limits.promptMaxLength}
              </span>
              {running ? (
                <button type="button" className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>
                  ■ Detener
                </button>
              ) : null}
              <button type="button" className="btn btn-primary" onClick={start} disabled={running || prompt.trim().length < 5 || tooLong}>
                {running ? (
                  <>
                    <span className="spinner" aria-hidden /> Ejecutando agentes…
                  </>
                ) : (
                  '▶ Iniciar workflow'
                )}
              </button>
            </div>
          </section>

          {error && (
            <p className="banner banner-error" role="alert">
              {error}
            </p>
          )}

          <AgentCards agents={agents} run={run} />

          <section className="stats" aria-label="Resumen de la ejecución">
            <div className="stat">
              <span>Estado</span>
              <Badge kind={runStatus}>{RUN_STATUS_LABEL[runStatus]}</Badge>
            </div>
            <div className="stat">
              <span>Tareas</span>
              <strong>
                {devTasks.filter((t) => t.status === 'completed').length}/{devTasks.length}
              </strong>
            </div>
            <div className="stat">
              <span>Iteraciones</span>
              <strong>{run?.totalIterations ?? 0}</strong>
            </div>
            <div className="stat">
              <span>Límite</span>
              <strong>{run?.maxIterations ?? maxIterations}</strong>
            </div>
            <div className="stat">
              <span>Duración</span>
              <strong>{run ? durationLabel(run.createdAt, run.finishedAt) : '—'}</strong>
            </div>
          </section>

          {run?.summary && run.status !== 'running' && (
            <section className={`card report report-${run.status}`} aria-labelledby="report-title">
              <p className="eyebrow">Informe final del Orchestrator</p>
              <h2 id="report-title">{run.status === 'passed' ? 'Workflow completado' : run.status === 'failed' ? 'Workflow con tareas fallidas' : 'Ejecución interrumpida'}</h2>
              <p>{run.summary}</p>
              <p className="muted">Petición: «{run.prompt}» · modo {run.mode === 'demo' ? 'demo' : 'LLM'}</p>
            </section>
          )}

          <div className="grid-2">
            <TaskBoard run={run} />
            <Conversation run={run} />
          </div>

          <ActivityLog run={run} />
        </main>

        <HistoryPanel
          runs={history}
          activeId={run?.id ?? null}
          loading={historyLoading}
          error={historyError}
          persistence={health?.persistence ?? null}
          onSelect={openRun}
          onRefresh={loadHistory}
          disabled={running}
        />
      </div>

      <footer className="footer">
        AgentFlow · Next.js + Supabase · {health?.mode === 'llm' ? 'Agentes con modelos reales' : 'Modo demo determinista: sin llamadas a APIs de pago'}
      </footer>
    </div>
  );
}
