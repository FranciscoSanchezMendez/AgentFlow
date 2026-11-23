import type { FileChange, WorkspaceFile } from './types';

/**
 * Workspace virtual de una ejecución.
 *
 * Los archivos que produce Develop NUNCA se escriben en el disco del servidor:
 * viven en memoria como una lista de cambios (`FileChange`) que se persiste con
 * el run. El estado del workspace en cualquier punto se reconstruye aplicando
 * esos cambios en orden.
 */

export const WORKSPACE_LIMITS = {
  maxFiles: 40,
  maxFileBytes: 200_000,
  maxPathLength: 120,
} as const;

/**
 * Normaliza una ruta relativa del workspace y rechaza todo lo que pueda salir de
 * él: rutas absolutas, unidades de Windows, `..`, segmentos vacíos o caracteres
 * fuera de una lista segura. Devuelve `null` si la ruta no es válida.
 */
export function sanitizePath(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const path = input.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (!path || path.length > WORKSPACE_LIMITS.maxPathLength) return null;
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return null;
  if (!/^[A-Za-z0-9_.\-/]+$/.test(path)) return null;
  const parts = path.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  return path;
}

/** Reconstruye el workspace aplicando los cambios `[0, upto)` (por defecto, todos). */
export function buildWorkspace(changes: FileChange[], upto = changes.length): Map<string, WorkspaceFile> {
  const files = new Map<string, WorkspaceFile>();
  for (const change of changes.slice(0, upto)) {
    if (change.kind === 'deleted' || change.after === null) {
      files.delete(change.path);
      continue;
    }
    const previous = files.get(change.path);
    files.set(change.path, {
      path: change.path,
      content: change.after,
      status: previous || change.kind === 'modified' ? 'modified' : 'created',
      taskId: change.taskId,
      iteration: change.iteration,
      changeId: change.id,
    });
  }
  return new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function snapshotOf(files: Map<string, WorkspaceFile>): Record<string, string> {
  return Object.fromEntries([...files.values()].map((f) => [f.path, f.content]));
}

export function languageOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'HTML',
    css: 'CSS',
    js: 'JavaScript',
    ts: 'TypeScript',
    tsx: 'TSX',
    json: 'JSON',
    md: 'Markdown',
    sql: 'SQL',
  };
  return map[ext] ?? 'Texto';
}

/** Pasos del historial agrupados por tarea e iteración (para el selector de versión). */
export interface WorkspaceStep {
  /** Número de cambios aplicados al terminar este paso. */
  upto: number;
  taskId: string;
  iteration: number;
  paths: string[];
}

export function workspaceSteps(changes: FileChange[]): WorkspaceStep[] {
  const steps: WorkspaceStep[] = [];
  changes.forEach((change, index) => {
    const last = steps.at(-1);
    if (last && last.taskId === change.taskId && last.iteration === change.iteration) {
      last.upto = index + 1;
      last.paths.push(change.path);
    } else {
      steps.push({ upto: index + 1, taskId: change.taskId, iteration: change.iteration, paths: [change.path] });
    }
  });
  return steps;
}

// Política de la vista previa: sin red, sin formularios reales hacia fuera,
// solo estilos y scripts en línea generados por el propio workspace.
export const PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

const escapeClosing = (content: string, tag: 'script' | 'style') =>
  content.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

/**
 * Genera un documento HTML autocontenido para la vista previa a partir de
 * `index.html`, incrustando las hojas de estilo y scripts locales que referencia.
 * Las referencias externas se eliminan. Devuelve `null` si no hay `index.html`.
 */
export function buildPreviewDocument(files: Record<string, string>, extraScript?: string): string | null {
  const html = files['index.html'];
  if (html === undefined) return null;

  let doc = html
    .replace(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi, (tag, href: string) => {
      if (!/rel=["']stylesheet["']/i.test(tag)) return '';
      const path = sanitizePath(href);
      const css = path ? files[path] : undefined;
      return css === undefined ? '' : `<style data-file="${path}">\n${escapeClosing(css, 'style')}\n</style>`;
    })
    .replace(/<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (_tag, src: string) => {
      const path = sanitizePath(src);
      const js = path ? files[path] : undefined;
      return js === undefined ? '' : `<script data-file="${path}">\n${escapeClosing(js, 'script')}\n</script>`;
    });

  const csp = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;
  doc = /<head[^>]*>/i.test(doc) ? doc.replace(/<head[^>]*>/i, (m) => `${m}\n${csp}`) : `${csp}\n${doc}`;

  if (extraScript) {
    const tag = `<script>\n${escapeClosing(extraScript, 'script')}\n</script>`;
    doc = /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, `${tag}\n</body>`) : `${doc}\n${tag}`;
  }
  return doc;
}
