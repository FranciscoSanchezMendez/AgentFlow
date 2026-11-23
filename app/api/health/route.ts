import { NextResponse } from 'next/server';
import { LIMITS } from '@/lib/config';
import { getServerContext } from '@/lib/server/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Estado público de la configuración. Nunca devuelve claves ni URLs privadas. */
export async function GET() {
  const { config, provider, repository } = getServerContext();
  return NextResponse.json({
    status: 'ok',
    mode: provider.mode,
    provider: provider.label,
    llmRequestedWithoutKey: config.requestedMode === 'llm' && !config.anthropicApiKey,
    persistence: repository.kind,
    limits: {
      minIterations: LIMITS.minIterations,
      maxIterations: LIMITS.maxIterations,
      defaultIterations: LIMITS.defaultIterations,
      promptMaxLength: LIMITS.promptMaxLength,
    },
  });
}
