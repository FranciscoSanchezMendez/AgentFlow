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

/** Devuelve el primer valor no vacío entre varias variables. */
function first(env: Record<string, string | undefined>, names: string[]): string | null {
  for (const name of names) {
    const value = clean(env[name]);
    if (value) return value;
  }
  return null;
}

/**
 * Nombres admitidos para Supabase. Además de los propios, se aceptan los que crea
 * la integración de Supabase del Marketplace de Vercel (prefijo `STORAGE_`).
 * Nunca se usan las claves públicas (anon / publishable) para escribir.
 */
const SUPABASE_URL_VARS = ['SUPABASE_URL', 'STORAGE_SUPABASE_URL', 'NEXT_PUBLIC_STORAGE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY_VARS = ['SUPABASE_SERVICE_ROLE_KEY', 'STORAGE_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'STORAGE_SUPABASE_SECRET_KEY'];

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const delay = Number.parseInt(env.AGENTFLOW_DEMO_DELAY_MS ?? '', 10);
  return {
    requestedMode: env.AGENTFLOW_MODE === 'llm' ? 'llm' : 'demo',
    anthropicApiKey: clean(env.ANTHROPIC_API_KEY),
    model: clean(env.AGENTFLOW_MODEL),
    supabaseUrl: first(env, SUPABASE_URL_VARS),
    supabaseServiceKey: first(env, SUPABASE_KEY_VARS),
    demoDelayMs: Number.isFinite(delay) && delay >= 0 ? Math.min(delay, 5000) : 400,
  };
}
