import { NextResponse } from 'next/server';
import { getServerContext } from '@/lib/server/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lista los hilos de desarrollo, del más reciente al más antiguo. */
export async function GET() {
  const { repository } = getServerContext();
  try {
    const threads = await repository.listThreads(30);
    return NextResponse.json({ threads, persistence: repository.kind });
  } catch (error) {
    console.error('[agentflow] Error al listar hilos:', error);
    return NextResponse.json({ error: 'No se pudieron cargar los hilos.' }, { status: 500 });
  }
}
