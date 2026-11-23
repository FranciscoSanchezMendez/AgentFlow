'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CONTACT_DEMO_PROMPT } from '@/lib/agents/demo/catalog';
import { agentsFromRun, applyEvent, initialDashboardState, readNdjson, type DashboardState } from '@/lib/client/runState';
import { activeRunsBefore, type Run, type Thread, type ThreadSummary, type WorkflowEvent } from '@/lib/types';
import { ActivityLog } from './ActivityLog';
import { AgentCards } from './AgentCards';
import { Conversation } from './Conversation';
import { HistoryPanel } from './HistoryPanel';
import { TaskBoard } from './TaskBoard';
import { ThreadBar } from './ThreadBar';
import { Workspace, type WorkspaceFocus } from './Workspace';
import { Badge, RUN_STATUS_LABEL, durationLabel } from './ui';

interface Health {
  mode: 'demo' | 'llm';
  provider: string;
  persistence: 'supabase' | 'memory';
  llmRequestedWithoutKey: boolean;
  limits: { minIterations: number; maxIterations: number; defaultIterations: number; promptMaxLength: number };
}

const NEW_THREAD_EXAMPLES = [
  CONTACT_DEMO_PROMPT,
  'Crea una API REST para gestionar productos.',
  'Implementa el login de usuarios con sesión segura.',
  'Construye una lista de tareas con filtros.',
];

const FOLLOWUP_EXAMPLES = [
  'Añade un calendario para agendar sesiones de llamada de 30 minutos.',
  'Añade un modo oscuro.',
  'Añade un pie de página con el año actual.',
  'Elimina la sección de novedades.',
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

/** Implementación que se muestra al abrir un hilo: la última activa (o la última). */
function defaultRun(thread: Thread): Run | undefined {
  return [...thread.runs].reverse().find((r) => !r.discarded) ?? thread.runs.at(-1);
}

export function Dashboard() {
  const [state, dispatch] = useReducer(reducer, undefined, initialDashboardState);
  const [prompt, setPrompt] = useState(NEW_THREAD_EXAMPLES[0]);
  const [maxIterations, setMaxIterations] = useState(3);
  const [running, setRunning] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState<string | null>(null);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [, forceTick] = useState(0);
  const [focus, setFocus] = useState<WorkspaceFocus | null>(null);
  const openFile = useCallback((path: string) => setFocus({ path, nonce: Date.now() }), []);

  const limits = health?.limits ?? { minIterations: 1, maxIterations: 10, defaultIterations: 3, promptMaxLength: 2000 };

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      const res = await fetch('/api/threads', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error al cargar los hilos');
      setThreads(data.threads);
    } catch (e) {
      setThreadsError(e instanceof Error ? e.message : 'Error al cargar los hilos');
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  const fetchThread = useCallback(async (id: string): Promise<Thread> => {
    const res = await fetch(`/api/threads/${id}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'No se pudo cargar el hilo');
    return data.thread as Thread;
  }, []);

  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((h: Health) => {
        setHealth(h);
        setMaxIterations(h.limits.defaultIterations);
      })
      .catch(() => setHealth(null));
    void loadThreads();
  }, [loadThreads]);

  // Refresca el cronómetro mientras hay una ejecución en curso.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [running]);

  async function openThread(id: string, runId?: string) {
    try {
      const thread = await fetchThread(id);
      setActiveThread(thread);
      const run = (runId && thread.runs.find((r) => r.id === runId)) || defaultRun(thread);
      if (run) dispatch({ type: 'load', run });
      else dispatch({ type: 'reset' });
      setPrompt('');
    } catch (e) {
      dispatch({ type: 'error', message: e instanceof Error ? e.message : 'No se pudo cargar el hilo' });
    }
  }

  function newThread() {
    setActiveThread(null);
    dispatch({ type: 'reset' });
    setPrompt(NEW_THREAD_EXAMPLES[0]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selectRun(runId: string) {
    const run = activeThread?.runs.find((r) => r.id === runId);
    if (run) dispatch({ type: 'load', run });
  }

  async function discard(runId: string) {
    if (!activeThread) return;
    setDiscarding(true);
    try {
      const res = await fetch(`/api/threads/${activeThread.id}/discard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'No se pudo descartar');
      const thread = data.thread as Thread;
      setActiveThread(thread);
      const run = defaultRun(thread);
      if (run) dispatch({ type: 'load', run });
      void loadThreads();
    } catch (e) {
      dispatch({ type: 'error', message: e instanceof Error ? e.message : 'No se pudo descartar la implementación' });
    } finally {
      setDiscarding(false);
    }
  }

  async function start() {
    if (running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    dispatch({ type: 'reset' });
    let threadId: string | null = activeThread?.id ?? null;
    let runId: string | null = null;
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, maxIterations, ...(activeThread ? { threadId: activeThread.id } : {}) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      await readNdjson(res.body, (event) => {
        if (event.type === 'run_started') {
          threadId = event.run.threadId;
          runId = event.run.id;
        }
        dispatch({ type: 'event', event });
      });
    } catch (e) {
      if (controller.signal.aborted) dispatch({ type: 'error', message: 'Ejecución cancelada por el usuario.' });
      else dispatch({ type: 'error', message: e instanceof Error ? e.message : 'No se pudo ejecutar el workflow.' });
    } finally {
      setRunning(false);
      abortRef.current = null;
      void loadThreads();
      // Recarga el hilo para incorporar la nueva implementación a su memoria.
      if (threadId) {
        try {
          const thread = await fetchThread(threadId);
          setActiveThread(thread);
          setPrompt('');
          const saved = runId ? thread.runs.find((r) => r.id === runId) : undefined;
          if (saved) dispatch({ type: 'load', run: saved });
        } catch {
          /* el run ya se muestra con los datos del stream */
        }
      }
    }
  }

  const { run, agents, error } = state;
  const runStatus = run?.status ?? 'idle';
  const devTasks = run?.tasks.filter((t) => t.assignee === 'develop') ?? [];
  const tooLong = prompt.length > limits.promptMaxLength;
  const examples = activeThread ? FOLLOWUP_EXAMPLES : NEW_THREAD_EXAMPLES;

  // Memoria del hilo para el Workspace: implementaciones activas anteriores a la que se muestra.
  const history = useMemo(() => {
    if (!activeThread || !run) return [];
    const inThread = activeThread.runs.some((r) => r.id === run.id);
    return inThread ? activeRunsBefore(activeThread, run.id) : activeThread.runs.filter((r) => !r.discarded);
  }, [activeThread, run]);

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
          {activeThread && (
            <ThreadBar
              thread={activeThread}
              currentRunId={run?.id ?? null}
              running={running}
              discarding={discarding}
              onSelectRun={selectRun}
              onDiscard={discard}
            />
          )}

          <section className="card request" aria-labelledby="request-title">
            <div className="request-head">
              <div>
                <p className="eyebrow">{activeThread ? 'Nueva implementación en el hilo' : 'Nuevo hilo de desarrollo'}</p>
                <h2 id="request-title">{activeThread ? `¿Qué añadimos a «${activeThread.title}»?` : '¿Qué quieres construir?'}</h2>
                {activeThread && (
                  <p className="muted request-hint">
                    Los agentes partirán del workspace actual del hilo y de sus peticiones anteriores, y Testing comprobará que lo ya aprobado
                    sigue funcionando.
                  </p>
                )}
              </div>
            </div>
            <label htmlFor="prompt" className="sr-only">
              Petición para el equipo de agentes
            </label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={activeThread ? 'Describe la mejora o el cambio que quieres sobre este hilo…' : 'Describe una tarea de desarrollo…'}
              maxLength={limits.promptMaxLength + 100}
              disabled={running}
              rows={3}
            />
            <div className="examples" aria-label="Ejemplos">
              {examples.map((ex) => (
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
                ) : activeThread ? (
                  '▶ Implementar en este hilo'
                ) : (
                  '▶ Iniciar hilo'
                )}
              </button>
            </div>
          </section>

          {error && (
            <p className="banner banner-error" role="alert">
              {error}
            </p>
          )}

          {run?.discarded && (
            <p className="banner" role="status">
              Estás viendo una implementación descartada: sus cambios ya no forman parte del workspace del hilo.
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
              <h2 id="report-title">
                {run.tasks.length === 0
                  ? run.status === 'passed'
                    ? 'Sin cambios necesarios'
                    : 'Petición no implementada'
                  : run.status === 'passed'
                    ? 'Workflow completado'
                    : run.status === 'failed'
                      ? 'Workflow con tareas fallidas'
                      : 'Ejecución interrumpida'}
              </h2>
              <p>{run.summary}</p>
              <p className="muted">Petición: «{run.prompt}» · modo {run.mode === 'demo' ? 'demo' : 'LLM'}</p>
            </section>
          )}

          <Workspace run={run} focus={focus} history={history} />

          <div className="grid-2">
            <TaskBoard run={run} onOpenFile={openFile} />
            <Conversation run={run} />
          </div>

          <ActivityLog run={run} />
        </main>

        <HistoryPanel
          threads={threads}
          activeId={activeThread?.id ?? null}
          loading={threadsLoading}
          error={threadsError}
          persistence={health?.persistence ?? null}
          onSelect={(id) => void openThread(id)}
          onNew={newThread}
          onRefresh={loadThreads}
          disabled={running}
        />
      </div>

      <footer className="footer">
        AgentFlow · Next.js + Supabase · {health?.mode === 'llm' ? 'Agentes con modelos reales' : 'Modo demo determinista: sin llamadas a APIs de pago'}
      </footer>
    </div>
  );
}
