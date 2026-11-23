import { describe, expect, it } from 'vitest';
import { readConfig } from '@/lib/config';
import { RateLimiter } from '@/lib/rateLimit';
import { isUuid, validateRunRequest } from '@/lib/validation';

describe('validateRunRequest', () => {
  it('acepta una petición válida y aplica el límite por defecto', () => {
    const r = validateRunRequest({ prompt: '  Crea un formulario  ' });
    expect(r).toEqual({ ok: true, value: { prompt: 'Crea un formulario', maxIterations: 3 } });
  });

  it.each([
    [null, /objeto JSON/],
    [{}, /obligatorio/],
    [{ prompt: 123 }, /obligatorio/],
    [{ prompt: 'abc' }, /al menos/],
    [{ prompt: 'x'.repeat(2001) }, /superar/],
    [{ prompt: 'Crea algo', maxIterations: 0 }, /entre 1 y 10/],
    [{ prompt: 'Crea algo', maxIterations: 11 }, /entre 1 y 10/],
    [{ prompt: 'Crea algo', maxIterations: 2.5 }, /entero/],
    [{ prompt: 'Crea algo', maxIterations: '3' }, /entero/],
  ])('rechaza %j', (body, message) => {
    const r = validateRunRequest(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });

  it('elimina caracteres de control', () => {
    const r = validateRunRequest({ prompt: 'Hola\u0000 mundo\u0007', maxIterations: 5 });
    expect(r.ok && r.value).toEqual({ prompt: 'Hola mundo', maxIterations: 5 });
  });
});

describe('isUuid', () => {
  it('valida UUIDs', () => {
    expect(isUuid('6f1c1e8e-3b5f-4f4e-9a57-1c2b3d4e5f60')).toBe(true);
    expect(isUuid('../../etc/passwd')).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('bloquea al superar el límite y libera al pasar la ventana', () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.check('ip', 0).allowed).toBe(true);
    expect(rl.check('ip', 10).allowed).toBe(true);
    const blocked = rl.check('ip', 20);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(rl.check('otra-ip', 20).allowed).toBe(true);
    expect(rl.check('ip', 1001).allowed).toBe(true);
  });
});

describe('readConfig', () => {
  it('ignora valores vacíos y limita el retardo demo', () => {
    const c = readConfig({ ANTHROPIC_API_KEY: '  ', SUPABASE_URL: '', AGENTFLOW_DEMO_DELAY_MS: '999999' });
    expect(c.anthropicApiKey).toBeNull();
    expect(c.supabaseUrl).toBeNull();
    expect(c.demoDelayMs).toBe(5000);
    expect(c.requestedMode).toBe('demo');
  });
});
