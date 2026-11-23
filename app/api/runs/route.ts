import { NextResponse } from 'next/server';
import { clientKey } from '@/lib/rateLimit';
import { getServerContext, runLimiter } from '@/lib/server/context';
import { titleFromPrompt } from '@/lib/agents/demo/catalog';
import type { ThreadInfo } from '@/lib/persistence/repository';
import { streamRun } from '@/lib/server/runService';
import { isThreadBusy, threadContext, type ThreadContext } from '@/lib/server/threads';
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

  // Hilo: si se indica, la implementación parte de su memoria; si no, se crea uno nuevo.
  let thread: ThreadInfo;
  let context: ThreadContext | undefined;
  try {
    if (parsed.value.threadId) {
      const existing = await repository.getThread(parsed.value.threadId);
      if (!existing) return NextResponse.json({ error: 'Hilo no encontrado.' }, { status: 404 });
      if (isThreadBusy(existing)) {
        return NextResponse.json({ error: 'Ya hay una implementación en curso en este hilo.' }, { status: 409 });
      }
      thread = { id: existing.id, title: existing.title, createdAt: existing.createdAt, updatedAt: existing.updatedAt };
      context = threadContext(existing);
    } else {
      const now = new Date().toISOString();
      thread = { id: crypto.randomUUID(), title: titleFromPrompt(parsed.value.prompt), createdAt: now, updatedAt: now };
    }
  } catch (error) {
    console.error('[agentflow] Error al cargar el hilo:', error);
    return NextResponse.json({ error: 'No se pudo cargar el hilo.' }, { status: 500 });
  }

  const stream = streamRun({
    prompt: parsed.value.prompt,
    maxIterations: parsed.value.maxIterations,
    provider,
    repository,
    stepDelayMs,
    signal: req.signal,
    thread,
    context,
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
