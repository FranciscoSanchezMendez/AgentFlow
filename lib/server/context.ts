import { createProvider } from '../agents/factory';
import { readConfig } from '../config';
import { getRepository } from '../persistence';
import { RateLimiter } from '../rateLimit';

/** Dependencias del servidor resueltas a partir del entorno. */
export function getServerContext() {
  const config = readConfig();
  const provider = createProvider(config);
  const repository = getRepository(config);
  return {
    config,
    provider,
    repository,
    // En modo demo las ejecuciones son gratuitas; se limita más en modo LLM.
    stepDelayMs: provider.mode === 'demo' ? config.demoDelayMs : 0,
  };
}

const globalStore = globalThis as unknown as { __agentflowLimiter?: RateLimiter };
export const runLimiter = (globalStore.__agentflowLimiter ??= new RateLimiter(10, 60_000));
