/**
 * Limitador de peticiones en memoria (ventana deslizante por clave).
 * Protege frente a abusos, especialmente en modo LLM donde cada ejecución
 * tiene coste. En despliegues con varias instancias es "best effort"; para
 * algo estricto usar un almacén compartido (p. ej. Upstash Redis).
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      const retryAfterSeconds = Math.ceil((this.windowMs - (now - recent[0])) / 1000);
      return { allowed: false, retryAfterSeconds };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.hits.clear();
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'anonymous';
}
