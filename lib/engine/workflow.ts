import type { AgentProvider, PlannedTask } from '../agents/provider';
import type {
  AgentId,
  AgentMessage,
  AgentStatus,
  Iteration,
  LogEntry,
  LogLevel,
  Run,
  Task,
  WorkflowEvent,
} from '../types';

export interface WorkflowOptions {
  prompt: string;
  maxIterations: number;
  provider: AgentProvider;
  onEvent?: (event: WorkflowEvent) => void | Promise<void>;
  /** Pausa entre pasos (solo estética en modo demo). */
  stepDelayMs?: number;
  signal?: AbortSignal;
  idFactory?: () => string;
  now?: () => Date;
}

const INTEGRATION_TITLE = 'Validación de integración final';

/**
 * Motor del flujo multiagente:
 *
 *   Orchestrator ──plan──▶ tareas
 *   por cada tarea:
 *     Develop ──código──▶ Testing ──feedback──▶ Develop  (hasta pasar o agotar iteraciones)
 *   Testing ──▶ validación de integración
 *   Orchestrator ──▶ informe final
 *
 * Emite eventos en tiempo real y devuelve el `Run` completo al terminar.
 */
export async function runWorkflow(options: WorkflowOptions): Promise<Run> {
  const { prompt, maxIterations, provider, onEvent, stepDelayMs = 0, signal } = options;
  const newId = options.idFactory ?? (() => crypto.randomUUID());
  const now = () => (options.now ? options.now() : new Date()).toISOString();

  const run: Run = {
    id: newId(),
    prompt,
    status: 'running',
    mode: provider.mode,
    maxIterations,
    totalIterations: 0,
    summary: null,
    error: null,
    createdAt: now(),
    finishedAt: null,
    tasks: [],
    messages: [],
    logs: [],
    iterations: [],
  };

  const emit = async (event: WorkflowEvent) => {
    if (onEvent) await onEvent(event);
  };
  const pause = async () => {
    if (signal?.aborted) throw new Error('Ejecución cancelada.');
    if (stepDelayMs > 0) await new Promise((r) => setTimeout(r, stepDelayMs));
  };
  const status = (agent: AgentId, s: AgentStatus, activity: string) =>
    emit({ type: 'agent_status', agent, status: s, activity });
  const log = async (agent: LogEntry['agent'], level: LogLevel, message: string) => {
    const entry: LogEntry = { id: newId(), runId: run.id, agent, level, message, createdAt: now() };
    run.logs.push(entry);
    await emit({ type: 'log', log: entry });
  };
  const say = async (msg: Omit<AgentMessage, 'id' | 'runId' | 'createdAt'>) => {
    const message: AgentMessage = { ...msg, id: newId(), runId: run.id, createdAt: now() };
    run.messages.push(message);
    await emit({ type: 'message', message });
  };
  const updateTask = async (task: Task, patch: Partial<Task>) => {
    Object.assign(task, patch, { updatedAt: now() });
    await emit({ type: 'task_updated', task: { ...task, feedback: [...task.feedback] } });
  };
  const createTask = async (planned: PlannedTask, assignee: AgentId, reviewer?: AgentId): Promise<Task> => {
    const task: Task = {
      id: newId(),
      runId: run.id,
      position: run.tasks.length,
      title: planned.title,
      description: planned.description,
      assignee,
      reviewer,
      status: 'pending',
      attempts: 0,
      acceptanceCriteria: planned.acceptanceCriteria,
      feedback: [],
      updatedAt: now(),
    };
    run.tasks.push(task);
    await emit({ type: 'task_created', task: { ...task } });
    return task;
  };

  await emit({ type: 'run_started', run: structuredClone(run) });

  try {
    // 1. Orchestrator planifica.
    await log('system', 'info', `Ejecución iniciada en modo ${provider.mode === 'demo' ? 'demo' : 'LLM'} (${provider.label}). Máx. ${maxIterations} iteraciones por tarea.`);
    await status('orchestrator', 'thinking', 'Analizando la petición');
    await log('orchestrator', 'info', 'Petición recibida. Analizando requisitos.');
    await pause();

    const plan = await provider.plan({ prompt });
    const devTasks: Task[] = [];
    for (const planned of plan.tasks) devTasks.push(await createTask(planned, 'develop', 'testing'));
    const integration = await createTask(
      {
        title: INTEGRATION_TITLE,
        description: 'Comprobar que todas las tareas de desarrollo han superado sus pruebas.',
        acceptanceCriteria: [{ id: 'all-tasks', description: 'Todas las tareas de desarrollo están completadas' }],
      },
      'testing',
    );

    await say({
      from: 'orchestrator',
      to: 'user',
      kind: 'plan',
      content: `${plan.rationale}\n\n${devTasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n')}`,
    });
    await log('orchestrator', 'success', `Plan creado con ${devTasks.length} tareas de desarrollo y 1 de validación.`);
    await pause();

    // 2. Ciclo Develop ⇄ Testing por tarea.
    for (const task of devTasks) {
      await status('orchestrator', 'working', `Asignando «${task.title}»`);
      await say({ from: 'orchestrator', to: 'develop', kind: 'assignment', taskId: task.id, content: `Te asigno «${task.title}». ${task.description}` });
      await status('orchestrator', 'waiting', 'Supervisando el ciclo de desarrollo');
      await pause();

      const plannedRef = { id: task.id, title: task.title, description: task.description, acceptanceCriteria: task.acceptanceCriteria };
      let passed = false;

      for (let attempt = 1; attempt <= maxIterations; attempt++) {
        // Develop
        await status('develop', 'working', `${attempt === 1 ? 'Implementando' : 'Corrigiendo'} «${task.title}» (iteración ${attempt})`);
        await updateTask(task, { status: 'in_progress', attempts: attempt });
        await log('develop', 'info', `Iteración ${attempt}: ${attempt === 1 ? 'implementando' : 'aplicando correcciones en'} «${task.title}».`);
        await pause();

        const impl = await provider.implement({ prompt, task: plannedRef, attempt, previousCode: task.code, feedback: task.feedback });
        await updateTask(task, { code: impl.code, status: 'in_review' });
        await say({ from: 'develop', to: 'testing', kind: 'implementation', taskId: task.id, iteration: attempt, content: impl.notes });
        await status('develop', 'waiting', 'Esperando revisión de Testing');

        // Testing
        await status('testing', 'working', `Verificando «${task.title}» (iteración ${attempt})`);
        await pause();
        const review = await provider.review({ prompt, task: plannedRef, code: impl.code, attempt });
        passed = review.results.length > 0 && review.results.every((r) => r.passed);

        const iteration: Iteration = { id: newId(), runId: run.id, taskId: task.id, number: attempt, passed, results: review.results, createdAt: now() };
        run.iterations.push(iteration);
        run.totalIterations += 1;
        await emit({ type: 'iteration', iteration });

        const okCount = review.results.filter((r) => r.passed).length;
        if (passed) {
          await updateTask(task, { status: 'completed', feedback: [] });
          await log('testing', 'success', `«${task.title}»: ${okCount}/${review.results.length} pruebas superadas.`);
          await say({ from: 'testing', to: 'develop', kind: 'approval', taskId: task.id, iteration: attempt, content: `Todas las pruebas pasan (${okCount}/${review.results.length}). Tarea aprobada.` });
          break;
        }

        await log('testing', 'warn', `«${task.title}»: ${review.results.length - okCount} pruebas fallidas en la iteración ${attempt}.`);
        if (attempt < maxIterations) {
          await updateTask(task, { status: 'changes_requested', feedback: review.feedback });
          await say({ from: 'testing', to: 'develop', kind: 'feedback', taskId: task.id, iteration: attempt, content: `Cambios necesarios:\n${review.feedback.map((f) => `• ${f}`).join('\n')}` });
          await status('testing', 'waiting', `Esperando las correcciones de Develop en «${task.title}»`);
        } else {
          await updateTask(task, { status: 'failed', feedback: review.feedback });
          await say({ from: 'testing', to: 'orchestrator', kind: 'escalation', taskId: task.id, iteration: attempt, content: `Se alcanzó el límite de ${maxIterations} iteraciones y siguen fallando ${review.feedback.length} pruebas.` });
          await log('orchestrator', 'error', `«${task.title}» marcada como fallida: límite de iteraciones alcanzado.`);
        }
        await pause();
      }
      await status('testing', 'idle', 'En espera');
      await status('develop', 'idle', 'En espera');
    }

    // 3. Validación de integración.
    await status('testing', 'working', 'Validación de integración');
    await updateTask(integration, { status: 'in_progress', attempts: 1 });
    await pause();
    const failed = devTasks.filter((t) => t.status !== 'completed');
    const integrationPassed = failed.length === 0;
    const integrationIteration: Iteration = {
      id: newId(),
      runId: run.id,
      taskId: integration.id,
      number: 1,
      passed: integrationPassed,
      results: [
        {
          criterionId: 'all-tasks',
          name: 'Todas las tareas de desarrollo están completadas',
          passed: integrationPassed,
          detail: integrationPassed ? `${devTasks.length}/${devTasks.length} tareas completadas.` : `Tareas fallidas: ${failed.map((t) => t.title).join(', ')}`,
        },
      ],
      createdAt: now(),
    };
    run.iterations.push(integrationIteration);
    await emit({ type: 'iteration', iteration: integrationIteration });
    await updateTask(integration, {
      status: integrationPassed ? 'completed' : 'failed',
      feedback: integrationPassed ? [] : failed.map((t) => `Pendiente: ${t.title}`),
    });
    await log('testing', integrationPassed ? 'success' : 'error', integrationPassed ? 'Validación de integración superada.' : 'La validación de integración ha fallado.');
    await status('testing', 'done', integrationPassed ? 'Pruebas superadas' : 'Pruebas con fallos');
    await status('develop', 'done', 'Trabajo entregado');

    // 4. Informe final.
    await status('orchestrator', 'working', 'Redactando informe final');
    await pause();
    const completed = devTasks.length - failed.length;
    run.status = integrationPassed ? 'passed' : 'failed';
    run.summary = integrationPassed
      ? `Workflow completado: ${completed}/${devTasks.length} tareas aprobadas por Testing en ${run.totalIterations} iteraciones de desarrollo.`
      : `Workflow terminado con fallos: ${completed}/${devTasks.length} tareas aprobadas. ${failed.length} tarea(s) agotaron el límite de ${maxIterations} iteraciones.`;
    await say({ from: 'orchestrator', to: 'user', kind: 'report', content: run.summary });
    await log('orchestrator', integrationPassed ? 'success' : 'warn', run.summary);
    await status('orchestrator', 'done', integrationPassed ? 'Workflow completado' : 'Workflow con fallos');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    run.status = 'error';
    run.error = message;
    run.summary = `La ejecución se detuvo por un error: ${message}`;
    for (const task of run.tasks) {
      if (task.status !== 'completed' && task.status !== 'failed') await updateTask(task, { status: 'failed' });
    }
    await log('system', 'error', run.summary);
    for (const agent of ['orchestrator', 'develop', 'testing'] as const) await status(agent, 'error', 'Ejecución interrumpida');
    await emit({ type: 'error', message });
  }

  run.finishedAt = now();
  await emit({ type: 'run_finished', run: structuredClone(run) });
  return run;
}
