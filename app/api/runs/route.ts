import { NextResponse } from 'next/server';
import { clientKey } from '@/lib/rateLimit';
import { getServerContext, runLimiter } from '@/lib/server/context';
import { streamRun } from '@/lib/server/runService';
import { validateRunRequest } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Vercel: tiempo máximo de la función (las ejecuciones LLM pueden tardar).
export const maxDuration = 300;

/** Lista el historial de ejecuciones. */
export async function GET() {
  const { repository } = getServerContext();
  try {
    const runs = await repository.listRuns(30);
    return NextResponse.json({ runs, persistence: repository.kind });
  } catch (error) {
    console.error('[agentflow] Error al listar ejecuciones:', error);
    return NextResponse.json({ error: 'No se pudo cargar el historial.' }, { status: 500 });
  }
}

/** Inicia una ejecución y transmite los eventos como NDJSON. */
export async function POST(req: Request) {
  const limit = runLimiter.check(clientKey(req));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Demasiadas ejecuciones. Inténtalo de nuevo en ${limit.retryAfterSeconds} s.` },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON no válido.' }, { status: 400 });
  }

  const parsed = validateRunRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { provider, repository, stepDelayMs } = getServerContext();
  const stream = streamRun({
    prompt: parsed.value.prompt,
    maxIterations: parsed.value.maxIterations,
    provider,
    repository,
    stepDelayMs,
    signal: req.signal,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
