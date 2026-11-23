// Alias de compatibilidad con la versión inicial del MVP (POST /api/run).
// La API actual es /api/runs.
export { POST } from '../runs/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
