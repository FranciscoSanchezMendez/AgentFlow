import { NextResponse } from 'next/server';
import { clientKey } from '@/lib/rateLimit';
import { getServerContext, runLimiter } from '@/lib/server/context';
import { discardLatestRun } from '@/lib/server/threads';
import { isUuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Descarta la última implementación activa del hilo. Body opcional:
 * `{ "runId": "…" }` para confirmar cuál se pretende descartar.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limit = runLimiter.check(clientKey(req));
  if (!limit.allowed) {
    return NextResponse.json({ error: `Demasiadas peticiones. Inténtalo de nuevo en ${limit.retryAfterSeconds} s.` }, { status: 429 });
  }

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Identificador no válido.' }, { status: 400 });

  let runId: string | undefined;
  const text = await req.text();
  if (text.trim()) {
    try {
      const body = JSON.parse(text) as { runId?: unknown };
      if (body.runId !== undefined) {
        if (typeof body.runId !== 'string' || !isUuid(body.runId)) {
          return NextResponse.json({ error: '«runId» no es un identificador válido.' }, { status: 400 });
        }
        runId = body.runId;
      }
    } catch {
      return NextResponse.json({ error: 'JSON no válido.' }, { status: 400 });
    }
  }

  const { repository } = getServerContext();
  try {
    const result = await discardLatestRun(repository, id, runId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ discardedRunId: result.run.id, thread: result.thread });
  } catch (error) {
    console.error('[agentflow] Error al descartar:', error);
    return NextResponse.json({ error: 'No se pudo descartar la implementación.' }, { status: 500 });
  }
}
