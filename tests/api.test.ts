import { beforeEach, describe, expect, it } from 'vitest';

// Fuerza modo demo, sin retardo y sin Supabase para los tests de la API.
beforeEach(() => {
  process.env.AGENTFLOW_MODE = 'demo';
  process.env.AGENTFLOW_DEMO_DELAY_MS = '0';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

const post = (body: unknown, ip = '10.0.0.1') =>
  new Request('http://localhost/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('API /api/runs', () => {
  it('POST devuelve 400 con JSON inválido o datos incorrectos', async () => {
    const { POST } = await import('@/app/api/runs/route');
    expect((await POST(post('{no-json', '1.1.1.1'))).status).toBe(400);
    const res = await POST(post({ prompt: 'ok', maxIterations: 50 }, '1.1.1.2'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeTruthy();
  });

  it('POST ejecuta el workflow y GET lo muestra en el historial y en detalle', async () => {
    const { POST, GET } = await import('@/app/api/runs/route');
    const res = await POST(post({ prompt: 'Crea una API REST de productos', maxIterations: 3 }, '2.2.2.2'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');

    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    const last = lines.at(-1);
    expect(last.type).toBe('run_finished');
    expect(last.run.status).toBe('passed');

    const list = await (await GET()).json();
    expect(list.persistence).toBe('memory');
    expect(list.runs.some((r: { id: string }) => r.id === last.run.id)).toBe(true);

    const detailRoute = await import('@/app/api/runs/[id]/route');
    const detail = await detailRoute.GET(new Request('http://localhost'), { params: Promise.resolve({ id: last.run.id }) });
    expect(detail.status).toBe(200);
    const detailRun = (await detail.json()).run;
    expect(detailRun.tasks).toHaveLength(4);
    expect(detailRun.changes.length).toBeGreaterThan(0);
  });

  it('GET /api/runs/[id] valida el identificador', async () => {
    const { GET } = await import('@/app/api/runs/[id]/route');
    expect((await GET(new Request('http://localhost'), { params: Promise.resolve({ id: 'no-uuid' }) })).status).toBe(400);
    const missing = await GET(new Request('http://localhost'), { params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }) });
    expect(missing.status).toBe(404);
  });

  it('aplica rate limiting por IP (429)', async () => {
    const { POST } = await import('@/app/api/runs/route');
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await POST(post({ prompt: 'x' }, '9.9.9.9'))).status);
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('GET /api/health no expone secretos', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-secreta-de-prueba';
    const { GET } = await import('@/app/api/health/route');
    const text = await (await GET()).text();
    delete process.env.ANTHROPIC_API_KEY;
    expect(text).not.toContain('sk-secreta-de-prueba');
    expect(JSON.parse(text).mode).toBe('demo');
  });
});
