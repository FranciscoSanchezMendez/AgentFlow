import type { ServerConfig } from '../config';
import { AnthropicProvider } from './anthropicProvider';
import { DemoProvider } from './demo/demoProvider';
import type { AgentProvider } from './provider';

/**
 * Elige el proveedor de los agentes. El modo demo es el predeterminado y el
 * único posible si no hay API key: nunca se inventan credenciales.
 */
export function createProvider(config: ServerConfig): AgentProvider {
  if (config.requestedMode === 'llm' && config.anthropicApiKey) {
    return new AnthropicProvider({ apiKey: config.anthropicApiKey, model: config.model ?? undefined });
  }
  return new DemoProvider();
}
