/**
 * Catálogo del modo demo: registro de dominios, selección por palabras clave y
 * utilidades de renderizado de plantillas.
 *
 * Todos los dominios generan una página web funcional (index.html + CSS + JS sin
 * dependencias), de modo que el resultado siempre se puede ver en la vista
 * previa del Workspace. Ver `types.ts` para el formato de las plantillas.
 */
import { apiDomain } from './domains/api';
import { calculatorDomain } from './domains/calculator';
import { contactDomain } from './domains/contact';
import { dashboardDomain } from './domains/dashboard';
import { landingDomain } from './domains/landing';
import { listDomain } from './domains/list';
import { loginDomain } from './domains/login';
import type { DemoDomain, DemoTask } from './types';

export type { DemoCriterion, DemoDomain, DemoTask } from './types';

/** Orden de prioridad: se usa el primer dominio cuyas palabras clave coinciden. */
export const DEMO_DOMAINS: DemoDomain[] = [
  contactDomain,
  loginDomain,
  calculatorDomain,
  dashboardDomain,
  apiDomain,
  landingDomain,
  listDomain, // genérico: cualquier otra petición
];

export const CONTACT_DEMO_PROMPT =
  'Crear una página de contacto responsive con nombre, email, asunto y mensaje, validación de campos y confirmación al enviar';

export function pickDomain(prompt: string): DemoDomain {
  return DEMO_DOMAINS.find((d) => d.keywords.test(prompt)) ?? listDomain;
}

/** Busca la plantilla de una tarea, empezando por el dominio de la petición. */
export function findDemoTask(title: string, prompt?: string): { domain: DemoDomain; task: DemoTask } | undefined {
  const ordered = prompt ? [pickDomain(prompt), ...DEMO_DOMAINS] : DEMO_DOMAINS;
  for (const domain of ordered) {
    const task = domain.tasks.find((t) => t.title === title);
    if (task) return { domain, task };
  }
  return undefined;
}

const MARKER = /^([ \t]*)@@([\w-]+)@@[ \t]*$/gm;

/**
 * Sustituye los marcadores de una plantilla. `resolve` devuelve el código de cada
 * criterio (o `null` para eliminar la línea). Admite marcadores anidados y
 * conserva la sangría del marcador en todas las líneas insertadas.
 */
export function renderTemplate(template: string, resolve: (criterionId: string) => string | null): string {
  let out = template;
  for (let depth = 0; depth < 4 && MARKER.test(out); depth++) {
    MARKER.lastIndex = 0;
    out = out.replace(MARKER, (_m, indent: string, id: string) => {
      const code = resolve(id);
      if (code === null || code === '') return '\u0000';
      return code
        .split('\n')
        .map((line) => (line ? indent + line : line))
        .join('\n');
    });
    MARKER.lastIndex = 0;
  }
  // Elimina las líneas de marcadores vacíos.
  return out.replace(/^\u0000\n?/gm, '');
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const LEADING_VERBS =
  /^(por favor,?\s+)?(quiero|necesito|me gustar[ií]a|crea(r)?|haz|hacer|construye|construir|implementa(r)?|desarrolla(r)?|dise[ñn]a(r)?|genera(r)?|programa(r)?|monta(r)?|prepara(r)?|a[ñn]ade|a[ñn]adir)\s+/i;

/**
 * Deriva un título legible de la petición: «Crea una landing page para una
 * cafetería con menú» → «Landing page para una cafetería». Determinista.
 */
export function titleFromPrompt(prompt: string): string {
  let text = prompt.trim().replace(/\s+/g, ' ');
  for (let i = 0; i < 3; i++) text = text.replace(LEADING_VERBS, '');
  text = text.replace(/^(un|una|unos|unas|el|la|los|las|mi)\s+/i, '');
  // «landing page para una cafetería» → «cafetería»
  text = text.replace(/^(landing( page)?|p[aá]gina( web)?|sitio( web)?|web|aplicaci[oó]n( web)?|app)\s+(para|de)\s+((una|un|el|la|mi)\s+)?/i, '');
  text = text.split(/\s+(?:con|que|donde|y que|para que)\s+|[,.;:]/i)[0] ?? text;
  text = text.trim();
  if (text.length > 60) text = `${text.slice(0, 57).trimEnd()}…`;
  if (!text) return 'Mi aplicación';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Sustituye los placeholders `{{TITLE}}` y `{{PROMPT}}` (con HTML escapado). */
export function fillPlaceholders(content: string, prompt: string): string {
  const shortPrompt = prompt.length > 160 ? `${prompt.slice(0, 157)}…` : prompt;
  return content.replaceAll('{{TITLE}}', escapeHtml(titleFromPrompt(prompt))).replaceAll('{{PROMPT}}', escapeHtml(shortPrompt));
}
