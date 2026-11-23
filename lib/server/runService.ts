import type { AgentProvider } from '../agents/provider';
import { runWorkflow } from '../engine/workflow';
import type { RunRepository } from '../persistence/repository';
import type { WorkflowEvent } from '../types';

export interface StreamRunOptions {
  prompt: string;
  maxIterations: number;
  provider: AgentProvider;
  repository: RunRepository;
  stepDelayMs: number;
  signal?: AbortSignal;
}

/**
 * Ejecuta el workflow y devuelve un stream NDJSON (un evento JSON por línea)
 * para que la interfaz muestre el progreso en tiempo real. Persiste el run al
 * empezar y al terminar; un fallo de persistencia no detiene la ejecución.
 */
export function streamRun(options: StreamRunOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: WorkflowEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true; // el cliente se desconectó
        }
      };

      const persist = async (event: Extract<WorkflowEvent, { type: 'run_started' | 'run_finished' }>) => {
        try {
          await options.repository.saveRun(event.run);
        } catch (error) {
          console.error('[agentflow] Error de persistencia:', error);
          write({
            type: 'log',
            log: {
              id: crypto.randomUUID(),
              runId: event.run.id,
              agent: 'system',
              level: 'warn',
              message: 'No se pudo guardar la ejecución en la base de datos. Revisa la configuración de Supabase.',
              createdAt: new Date().toISOString(),
            },
          });
        }
      };

      try {
        await runWorkflow({
          prompt: options.prompt,
          maxIterations: options.maxIterations,
          provider: options.provider,
          stepDelayMs: options.stepDelayMs,
          signal: options.signal,
          onEvent: async (event) => {
            write(event);
            if (event.type === 'run_started' || event.type === 'run_finished') await persist(event);
          },
        });
      } catch (error) {
        console.error('[agentflow] Error inesperado en el workflow:', error);
        write({ type: 'error', message: 'Error interno al ejecutar el workflow.' });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* ya cerrado */
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
}
