/**
 * Configuración leída del entorno (solo servidor). Nunca expone secretos al cliente:
 * las variables sensibles NO llevan el prefijo NEXT_PUBLIC_.
 */

export const LIMITS = {
  promptMinLength: 5,
  promptMaxLength: 2000,
  minIterations: 1,
  maxIterations: 10,
  defaultIterations: 3,
} as const;

export interface ServerConfig {
  requestedMode: 'demo' | 'llm';
  anthropicApiKey: string | null;
  model: string | null;
  supabaseUrl: string | null;
  supabaseServiceKey: string | null;
  demoDelayMs: number;
}

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const delay = Number.parseInt(env.AGENTFLOW_DEMO_DELAY_MS ?? '', 10);
  return {
    requestedMode: env.AGENTFLOW_MODE === 'llm' ? 'llm' : 'demo',
    anthropicApiKey: clean(env.ANTHROPIC_API_KEY),
    model: clean(env.AGENTFLOW_MODEL),
    supabaseUrl: clean(env.SUPABASE_URL),
    supabaseServiceKey: clean(env.SUPABASE_SERVICE_ROLE_KEY),
    demoDelayMs: Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 5000) : 400,
  };
}
