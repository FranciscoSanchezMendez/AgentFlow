/**
 * Mejoras incrementales del modo demo: se usan cuando el hilo ya tiene archivos.
 *
 * A diferencia de los dominios (que generan archivos completos desde plantillas),
 * cada criterio es un PARCHE sobre el workspace existente: se inserta antes de una
 * línea de anclaje (p. ej. `</body>`) o se añade al final del archivo. Así Develop
 * modifica lo que ya hay y el diff muestra solo lo nuevo.
 *
 * Placeholders: `{{SLUG}}` (identificador estable de la petición) y
 * `{{PROMPT_JSON}}` (la petición como literal JSON seguro dentro de <script>).
 */
import { escapeHtml } from './catalog';

export interface PatchCriterion {
  id: string;
  description: string;
  file: string;
  expect: string[];
  snippet: string;
  /** Se inserta antes de la primera línea que contenga alguno de estos textos; si no, al final. */
  before?: string[];
}

export interface FollowupTask {
  title: string;
  description: string;
  misses: number;
  criteria: PatchCriterion[];
}

export interface Followup {
  id: string;
  label: string;
  keywords: RegExp;
  rationale: string;
  tasks: FollowupTask[];
}

const BODY_END = ['</body>'];

const darkMode: Followup = {
  id: 'dark',
  label: 'modo oscuro',
  keywords: /(oscuro|dark|tema|noche)/i,
  rationale: 'Añado un tema oscuro con selector, sin tocar la lógica existente.',
  tasks: [
    {
      title: 'Modo oscuro: definir los estilos del tema',
      description: 'Añadir a styles.css las reglas del tema oscuro y el estilo del botón selector.',
      misses: 1,
      criteria: [
        {
          id: 'dark-base',
          description: 'Define el tema oscuro y el estilo del selector',
          file: 'styles.css',
          expect: ['html.theme-dark body {', '.theme-toggle {'],
          snippet: `/* Tema oscuro (mejora del hilo) */
html.theme-dark { color-scheme: dark; }
html.theme-dark body { background: #12141c; color: #e6e8ef; }
.theme-toggle { position: fixed; right: 16px; bottom: 16px; z-index: 50; border: 0; border-radius: 999px; padding: 10px 16px; font: inherit; font-weight: 700; background: #1f2438; color: #fff; cursor: pointer; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25); }
html.theme-dark .theme-toggle { background: #f3f4f8; color: #1c2033; }`,
        },
        {
          id: 'dark-surfaces',
          description: 'Adapta tarjetas, campos y textos secundarios al tema oscuro',
          file: 'styles.css',
          expect: ['html.theme-dark input,'],
          snippet: `html.theme-dark .card, html.theme-dark .contact, html.theme-dark .kpi, html.theme-dark .offer, html.theme-dark .section.alt, html.theme-dark .site-header, html.theme-dark .site-footer, html.theme-dark .af-changelog { background: #1c1f2b; color: #e6e8ef; box-shadow: none; }
html.theme-dark input, html.theme-dark textarea, html.theme-dark select { background: #232736; color: #e6e8ef; border-color: #3a3f52; }
html.theme-dark .muted, html.theme-dark .lead, html.theme-dark label, html.theme-dark th, html.theme-dark td { color: #c3c8d8; }`,
        },
      ],
    },
    {
      title: 'Modo oscuro: añadir el selector de tema',
      description: 'Crear theme.js con el botón que alterna el tema y cargarlo desde index.html.',
      misses: 1,
      criteria: [
        {
          id: 'dark-script',
          description: 'El botón alterna el tema y su estado accesible',
          file: 'theme.js',
          expect: ["document.documentElement.classList.toggle('theme-dark')", "button.setAttribute('aria-pressed'"],
          snippet: `// Selector de tema claro/oscuro (mejora del hilo).
(function () {
  var button = document.createElement('button');
  button.type = 'button';
  button.id = 'theme-toggle';
  button.className = 'theme-toggle';
  button.setAttribute('aria-pressed', 'false');
  button.textContent = 'Modo oscuro';
  button.addEventListener('click', function () {
    var dark = document.documentElement.classList.toggle('theme-dark');
    button.setAttribute('aria-pressed', String(dark));
    button.textContent = dark ? 'Modo claro' : 'Modo oscuro';
  });
  document.body.appendChild(button);
})();`,
        },
        {
          id: 'dark-load',
          description: 'index.html carga theme.js',
          file: 'index.html',
          expect: ['<script src="theme.js"></script>'],
          snippet: '<script src="theme.js"></script>',
          before: BODY_END,
        },
        {
          id: 'dark-system',
          description: 'Respeta la preferencia de tema del sistema',
          file: 'theme.js',
          expect: ["matchMedia('(prefers-color-scheme: dark)')"],
          snippet: `if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.getElementById('theme-toggle').click();
}`,
        },
      ],
    },
  ],
};

const footer: Followup = {
  id: 'footer',
  label: 'pie de página',
  keywords: /(pie de p[aá]gina|footer|copyright|derechos)/i,
  rationale: 'Añado un pie de página con el año actualizado automáticamente.',
  tasks: [
    {
      title: 'Pie de página: maquetar',
      description: 'Añadir el pie de página a index.html y sus estilos a styles.css.',
      misses: 1,
      criteria: [
        {
          id: 'foot-markup',
          description: 'La página tiene un pie con copyright y contacto',
          file: 'index.html',
          expect: ['<footer class="site-footer"', 'id="footer-year"'],
          snippet: `<footer class="site-footer">
  <p>© <span id="footer-year"></span> · Todos los derechos reservados · <a href="mailto:hola@ejemplo.com">hola@ejemplo.com</a></p>
</footer>`,
          before: BODY_END,
        },
        {
          id: 'foot-styles',
          description: 'El pie de página tiene estilos propios',
          file: 'styles.css',
          expect: ['.site-footer {'],
          snippet: `/* Pie de página (mejora del hilo) */
.site-footer { width: 100%; text-align: center; padding: 20px 16px; color: #5d6479; font-size: 14px; }
.site-footer a { color: inherit; }`,
        },
      ],
    },
    {
      title: 'Pie de página: año automático',
      description: 'Crear footer.js para mostrar el año actual y cargarlo desde index.html.',
      misses: 1,
      criteria: [
        {
          id: 'foot-year',
          description: 'Muestra el año actual',
          file: 'footer.js',
          expect: ["document.getElementById('footer-year').textContent = String(new Date().getFullYear());"],
          snippet: `// Año del pie de página (mejora del hilo).
document.getElementById('footer-year').textContent = String(new Date().getFullYear());`,
        },
        {
          id: 'foot-load',
          description: 'index.html carga footer.js',
          file: 'index.html',
          expect: ['<script src="footer.js"></script>'],
          snippet: '<script src="footer.js"></script>',
          before: BODY_END,
        },
      ],
    },
  ],
};

const changelog: Followup = {
  id: 'changelog',
  label: 'registro de novedades',
  keywords: /.*/,
  rationale:
    'En modo demo no hay una plantilla específica para esta mejora, así que Develop la registra en la sección «Novedades» de la página para que quede constancia visible en el workspace.',
  tasks: [
    {
      title: 'Novedades: preparar la sección',
      description: 'Añadir (si no existe) la sección «Novedades» con su script y estilos.',
      misses: 1,
      criteria: [
        {
          id: 'news-section',
          description: 'La página tiene una sección «Novedades»',
          file: 'index.html',
          expect: ['id="novedades-list"'],
          snippet: `<section id="novedades" class="af-changelog" aria-labelledby="novedades-title">
  <h2 id="novedades-title">Novedades</h2>
  <ul id="novedades-list"></ul>
</section>`,
          before: BODY_END,
        },
        {
          id: 'news-styles',
          description: 'La sección de novedades tiene estilos',
          file: 'styles.css',
          expect: ['.af-changelog {'],
          snippet: `/* Novedades (mejora del hilo) */
.af-changelog { width: 100%; max-width: 640px; margin: 24px auto; padding: 18px 22px; background: #fff; border-radius: 14px; box-shadow: 0 6px 18px rgba(28, 32, 51, 0.06); }
.af-changelog h2 { margin: 0 0 8px; font-size: 18px; }
.af-changelog li { margin: 4px 0; }`,
        },
        {
          id: 'news-fn',
          description: 'changelog.js permite añadir entradas sin duplicarlas',
          file: 'changelog.js',
          expect: ['function addChangelogEntry('],
          snippet: `// Registro de novedades de la página (mejoras pedidas en el hilo).
function addChangelogEntry(id, text) {
  var list = document.getElementById('novedades-list');
  if (!list || list.querySelector('[data-entry="' + id + '"]')) return;
  var item = document.createElement('li');
  item.setAttribute('data-entry', id);
  item.textContent = text;
  list.appendChild(item);
}`,
        },
        {
          id: 'news-load',
          description: 'index.html carga changelog.js',
          file: 'index.html',
          expect: ['<script src="changelog.js"></script>'],
          snippet: '<script src="changelog.js"></script>',
          before: BODY_END,
        },
      ],
    },
    {
      title: 'Novedades: registrar la mejora solicitada',
      description: 'Añadir la petición a la lista de novedades.',
      misses: 0,
      criteria: [
        {
          id: 'news-entry',
          description: 'La mejora solicitada aparece en «Novedades»',
          file: 'changelog.js',
          expect: ["addChangelogEntry('{{SLUG}}'"],
          snippet: "addChangelogEntry('{{SLUG}}', {{PROMPT_JSON}});",
        },
      ],
    },
  ],
};

export const FOLLOWUPS: Followup[] = [darkMode, footer, changelog];

export function pickFollowup(prompt: string): Followup {
  return FOLLOWUPS.find((f) => f.keywords.test(prompt)) ?? changelog;
}

export function findFollowupTask(title: string): { followup: Followup; task: FollowupTask } | undefined {
  for (const followup of FOLLOWUPS) {
    const task = followup.tasks.find((t) => t.title === title);
    if (task) return { followup, task };
  }
  return undefined;
}

/** Identificador corto y estable de una petición. */
export function slugOf(prompt: string): string {
  let hash = 5381;
  for (let i = 0; i < prompt.length; i++) hash = ((hash << 5) + hash + prompt.charCodeAt(i)) >>> 0;
  return `m${hash.toString(36)}`;
}

/** Sustituye los placeholders de las mejoras. */
export function fillFollowup(text: string, prompt: string): string {
  const json = JSON.stringify(prompt.slice(0, 200)).replace(/</g, '\\u003c');
  return text.replaceAll('{{SLUG}}', slugOf(prompt)).replaceAll('{{PROMPT_JSON}}', json).replaceAll('{{PROMPT}}', escapeHtml(prompt));
}

/**
 * Aplica un parche: si el archivo ya cumple el criterio no lo toca; si no,
 * inserta el fragmento antes del anclaje (conservando su sangría) o al final.
 */
export function applyPatch(content: string, criterion: PatchCriterion): string {
  if (criterion.expect.every((fragment) => content.includes(fragment))) return content;
  const lines = content === '' ? [] : content.replace(/\n$/, '').split('\n');
  let index = -1;
  for (const anchor of criterion.before ?? []) {
    index = lines.findIndex((line) => line.includes(anchor));
    if (index !== -1) break;
  }
  const snippet = criterion.snippet.split('\n');
  if (index === -1) {
    return [...lines, ...(lines.length ? [''] : []), ...snippet].join('\n') + '\n';
  }
  const indent = /^\s*/.exec(lines[index])![0] + (lines[index].trim() === '</body>' ? '  ' : '');
  lines.splice(index, 0, ...snippet.map((line) => (line ? indent + line : line)));
  return lines.join('\n') + '\n';
}
