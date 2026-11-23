import { NextResponse } from 'next/server';
import { getServerContext } from '@/lib/server/context';
import { isUuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hilo completo: todas sus implementaciones con tareas, mensajes, logs y cambios. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Identificador no válido.' }, { status: 400 });

  const { repository } = getServerContext();
  try {
    const thread = await repository.getThread(id);
    if (!thread) return NextResponse.json({ error: 'Hilo no encontrado.' }, { status: 404 });
    return NextResponse.json({ thread });
  } catch (error) {
    console.error('[agentflow] Error al cargar el hilo:', error);
    return NextResponse.json({ error: 'No se pudo cargar el hilo.' }, { status: 500 });
  }
}
