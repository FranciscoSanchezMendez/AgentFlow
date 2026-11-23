import { LIMITS } from './config';

export interface RunRequest {
  prompt: string;
  maxIterations: number;
  /** Hilo sobre el que se implementa (si falta, se crea uno nuevo). */
  threadId?: string;
}

export type ValidationResult = { ok: true; value: RunRequest } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Valida y normaliza el cuerpo de POST /api/runs. */
export function validateRunRequest(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'El cuerpo debe ser un objeto JSON.' };
  const { prompt, maxIterations, threadId } = body as Record<string, unknown>;
  if (threadId !== undefined && threadId !== null && (typeof threadId !== 'string' || !isUuid(threadId))) {
    return { ok: false, error: '«threadId» no es un identificador válido.' };
  }

  if (typeof prompt !== 'string') return { ok: false, error: 'El campo «prompt» es obligatorio.' };
  // Elimina caracteres de control (excepto saltos de línea y tabuladores).
  const clean = prompt.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (clean.length < LIMITS.promptMinLength) {
    return { ok: false, error: `Describe la petición con al menos ${LIMITS.promptMinLength} caracteres.` };
  }
  if (clean.length > LIMITS.promptMaxLength) {
    return { ok: false, error: `La petición no puede superar ${LIMITS.promptMaxLength} caracteres.` };
  }

  let iterations: number = LIMITS.defaultIterations;
  if (maxIterations !== undefined) {
    if (typeof maxIterations !== 'number' || !Number.isInteger(maxIterations)) {
      return { ok: false, error: '«maxIterations» debe ser un número entero.' };
    }
    if (maxIterations < LIMITS.minIterations || maxIterations > LIMITS.maxIterations) {
      return { ok: false, error: `«maxIterations» debe estar entre ${LIMITS.minIterations} y ${LIMITS.maxIterations}.` };
    }
    iterations = maxIterations;
  }

  const value: RunRequest = { prompt: clean, maxIterations: iterations };
  if (typeof threadId === 'string') value.threadId = threadId;
  return { ok: true, value };
}
