import { createClient } from '@supabase/supabase-js';
import type { ServerConfig } from '../config';
import { MemoryRunRepository } from './memoryRepository';
import type { RunRepository } from './repository';
import { SupabaseRunRepository } from './supabaseRepository';

// Se conserva entre recargas en caliente de Next.js en desarrollo.
const globalStore = globalThis as unknown as { __agentflowRepo?: RunRepository; __agentflowRepoKey?: string };

export function getRepository(config: ServerConfig): RunRepository {
  const key = config.supabaseUrl && config.supabaseServiceKey ? `supabase:${config.supabaseUrl}` : 'memory';
  if (globalStore.__agentflowRepo && globalStore.__agentflowRepoKey === key) return globalStore.__agentflowRepo;

  const repo: RunRepository =
    key === 'memory'
      ? new MemoryRunRepository()
      : new SupabaseRunRepository(
          createClient(config.supabaseUrl!, config.supabaseServiceKey!, {
            auth: { persistSession: false, autoRefreshToken: false },
          }),
        );
  globalStore.__agentflowRepo = repo;
  globalStore.__agentflowRepoKey = key;
  return repo;
}

export type { RunRepository } from './repository';
