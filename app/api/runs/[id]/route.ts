import { NextResponse } from 'next/server';
import { getServerContext } from '@/lib/server/context';
import { isUuid } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Detalle completo de una ejecución (tareas, mensajes, logs e iteraciones). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Identificador no válido.' }, { status: 400 });

  const { repository } = getServerContext();
  try {
    const run = await repository.getRun(id);
    if (!run) return NextResponse.json({ error: 'Ejecución no encontrada.' }, { status: 404 });
    return NextResponse.json({ run });
  } catch (error) {
    console.error('[agentflow] Error al cargar la ejecución:', error);
    return NextResponse.json({ error: 'No se pudo cargar la ejecución.' }, { status: 500 });
  }
}
