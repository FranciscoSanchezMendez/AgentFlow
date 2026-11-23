/**
 * Catálogo de plantillas del modo demo.
 *
 * Cada dominio define:
 *  - las tareas que crearía el Orchestrator y sus criterios de aceptación;
 *  - las plantillas de los archivos que escribe Develop. Cada plantilla contiene
 *    marcadores `@@id-del-criterio@@` en líneas propias: Develop sustituye cada
 *    marcador por el código que satisface ese criterio (o por `fallback` cuando
 *    "olvida" el criterio en el primer intento).
 *
 * `misses` indica cuántos criterios (los últimos de la tarea) omite Develop en el
 * primer intento. Así se reproduce de forma determinista el ciclo
 * Develop → Testing (falla) → feedback → Develop corrige → Testing valida.
 */

export interface DemoCriterion {
  id: string;
  description: string;
  file: string;
  expect: string[];
  snippet: string;
  /** Código que deja Develop cuando omite el criterio (por defecto, nada). */
  fallback?: string;
}

export interface DemoTask {
  title: string;
  description: string;
  misses: number;
  criteria: DemoCriterion[];
}

export interface DemoDomain {
  id: string;
  label: string;
  keywords: RegExp;
  tasks: DemoTask[];
  templates: Record<string, string>;
}

/* ------------------------------------------------------------------------ */
/* Dominio principal: página de contacto (HTML + CSS + JS sin dependencias)  */
/* ------------------------------------------------------------------------ */

const CONTACT_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Contacto</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="contact">
    <header class="contact-header">
      <p class="eyebrow">Contacto</p>
      <h1>Hablemos de tu proyecto</h1>
      <p>Rellena el formulario y te responderemos en menos de 24 horas.</p>
    </header>
    <form id="contact-form" class="contact-form" novalidate>
      @@html-fields@@
      @@html-submit@@
    </form>
  </main>
  @@html-scripts@@
</body>
</html>
`;

const CONTACT_CSS = `:root {
  --bg: #f5f6fb;
  --card: #ffffff;
  --text: #1c2033;
  --muted: #5d6479;
  --accent: #6d4aff;
  --danger: #d93b3b;
  --ok: #138a56;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 16px;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

.contact {
  width: 100%;
  max-width: 640px;
  background: var(--card);
  border-radius: 18px;
  padding: 32px;
  box-shadow: 0 12px 40px rgba(28, 32, 51, 0.12);
}

.eyebrow { margin: 0; color: var(--accent); font-weight: 700; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
h1 { margin: 6px 0 8px; font-size: 28px; }
.contact-header p:last-child { margin: 0 0 24px; color: var(--muted); }

.contact-form { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-full { grid-column: 1 / -1; }
label { font-weight: 600; font-size: 14px; }

input, textarea {
  font: inherit;
  padding: 12px 14px;
  border: 1px solid #cfd3e1;
  border-radius: 10px;
  background: #fbfbfe;
}
input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
[aria-invalid="true"] { border-color: var(--danger); background: #fff6f6; }
.error { margin: 0; min-height: 18px; color: var(--danger); font-size: 13px; }

button {
  grid-column: 1 / -1;
  justify-self: start;
  border: 0;
  border-radius: 10px;
  padding: 12px 22px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.status { grid-column: 1 / -1; margin: 0; font-weight: 600; }
.status-success { padding: 12px 14px; border-radius: 10px; background: #e8f7ef; color: var(--ok); }

@@css-responsive@@
`;

const CONTACT_VALIDATION = `// Validación del formulario de contacto (función pura, sin dependencias).
function validateContact(data) {
  var errors = {};
  @@val-required@@
  @@val-email@@
  @@val-length@@
  return errors;
}
`;

const CONTACT_APP = `// Envío del formulario de contacto.
// El envío es local: no se manda nada a ningún servidor.
(function () {
  var form = document.getElementById('contact-form');
  var status = document.getElementById('form-status');
  var fields = ['name', 'email', 'subject', 'message'];

  function showErrors(errors) {
    @@app-errors@@
  }

  @@app-submit@@
})();
`;

const contactDomain: DemoDomain = {
  id: 'contact',
  label: 'página de contacto',
  keywords: /(formulario|form|contacto|contact|encuesta|suscrip)/i,
  templates: {
    'index.html': CONTACT_HTML,
    'styles.css': CONTACT_CSS,
    'validation.js': CONTACT_VALIDATION,
    'app.js': CONTACT_APP,
  },
  tasks: [
    {
      title: 'Maquetar la página de contacto',
      description: 'Crear index.html con los campos nombre, email, asunto y mensaje, y styles.css con un diseño responsive.',
      misses: 0,
      criteria: [
        {
          id: 'html-fields',
          description: 'Incluye nombre, email, asunto y mensaje con etiquetas accesibles',
          file: 'index.html',
          expect: ['name="name"', 'name="email"', 'name="subject"', 'name="message"', 'for="email"', 'id="message-error"'],
          snippet: `<div class="field">
  <label for="name">Nombre</label>
  <input id="name" name="name" type="text" autocomplete="name" aria-describedby="name-error" />
  <p class="error" id="name-error"></p>
</div>
<div class="field">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="email" aria-describedby="email-error" />
  <p class="error" id="email-error"></p>
</div>
<div class="field field-full">
  <label for="subject">Asunto</label>
  <input id="subject" name="subject" type="text" aria-describedby="subject-error" />
  <p class="error" id="subject-error"></p>
</div>
<div class="field field-full">
  <label for="message">Mensaje</label>
  <textarea id="message" name="message" rows="5" aria-describedby="message-error"></textarea>
  <p class="error" id="message-error"></p>
</div>`,
        },
        {
          id: 'html-submit',
          description: 'Tiene botón de envío y una zona de confirmación accesible',
          file: 'index.html',
          expect: ['type="submit"', 'id="form-status"', 'role="status"'],
          snippet: `<button type="submit">Enviar mensaje</button>
<p id="form-status" class="status" role="status" aria-live="polite"></p>`,
        },
        {
          id: 'css-responsive',
          description: 'El diseño se adapta a móvil (una columna por debajo de 600 px)',
          file: 'styles.css',
          expect: ['@media (max-width: 600px)', 'grid-template-columns: 1fr;'],
          snippet: `@media (max-width: 600px) {
  .contact { padding: 22px; }
  .contact-form { grid-template-columns: 1fr; }
  button { width: 100%; }
}`,
        },
      ],
    },
    {
      title: 'Validar los campos del formulario',
      description: 'Crear validation.js con una función validateContact que compruebe campos obligatorios, formato de email y longitud del mensaje.',
      misses: 2,
      criteria: [
        {
          id: 'val-required',
          description: 'Rechaza nombre, asunto y mensaje vacíos',
          file: 'validation.js',
          expect: ['errors.name =', 'errors.subject =', "errors.message = 'El mensaje es obligatorio.'"],
          snippet: `if (!data.name.trim()) errors.name = 'El nombre es obligatorio.';
if (!data.subject.trim()) errors.subject = 'El asunto es obligatorio.';
if (!data.message.trim()) errors.message = 'El mensaje es obligatorio.';`,
        },
        {
          id: 'val-email',
          description: 'Valida el formato del email, no solo que no esté vacío',
          file: 'validation.js',
          expect: ['EMAIL_PATTERN.test('],
          snippet: String.raw`var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
if (!data.email.trim()) errors.email = 'El email es obligatorio.';
else if (!EMAIL_PATTERN.test(data.email.trim())) errors.email = 'Introduce un email válido.';`,
          fallback: `if (!data.email.trim()) errors.email = 'El email es obligatorio.';`,
        },
        {
          id: 'val-length',
          description: 'Exige un mensaje de al menos 20 caracteres',
          file: 'validation.js',
          expect: ['MIN_MESSAGE_LENGTH = 20', '.length < MIN_MESSAGE_LENGTH'],
          snippet: `var MIN_MESSAGE_LENGTH = 20;
if (!errors.message && data.message.trim().length < MIN_MESSAGE_LENGTH) {
  errors.message = 'El mensaje debe tener al menos ' + MIN_MESSAGE_LENGTH + ' caracteres.';
}`,
        },
      ],
    },
    {
      title: 'Gestionar el envío y la confirmación',
      description: 'Crear app.js para validar al enviar, mostrar los errores junto a cada campo y confirmar el envío; enlazar los scripts en index.html.',
      misses: 1,
      criteria: [
        {
          id: 'app-submit',
          description: 'Intercepta el envío y valida con validateContact',
          file: 'app.js',
          expect: ["form.addEventListener('submit'", 'event.preventDefault()', 'validateContact(data)'],
          snippet: `form.addEventListener('submit', function (event) {
  event.preventDefault();
  var data = {};
  fields.forEach(function (field) { data[field] = form.elements[field].value; });
  var errors = validateContact(data);
  showErrors(errors);
  if (Object.keys(errors).length > 0) {
    status.textContent = '';
    status.className = 'status';
    var firstInvalid = form.querySelector('[aria-invalid="true"]');
    if (firstInvalid) firstInvalid.focus();
    return;
  }
  @@app-confirm@@
});`,
        },
        {
          id: 'app-errors',
          description: 'Muestra cada error junto a su campo y marca aria-invalid',
          file: 'app.js',
          expect: ["setAttribute('aria-invalid', 'true')", "removeAttribute('aria-invalid')"],
          snippet: `fields.forEach(function (field) {
  var input = form.elements[field];
  var message = document.getElementById(field + '-error');
  if (errors[field]) {
    input.setAttribute('aria-invalid', 'true');
    message.textContent = errors[field];
  } else {
    input.removeAttribute('aria-invalid');
    message.textContent = '';
  }
});`,
        },
        {
          id: 'html-scripts',
          description: 'index.html carga validation.js y app.js',
          file: 'index.html',
          expect: ['<script src="validation.js"></script>', '<script src="app.js"></script>'],
          snippet: `<script src="validation.js"></script>
<script src="app.js"></script>`,
        },
        {
          id: 'app-confirm',
          description: 'Confirma el envío al usuario y limpia el formulario',
          file: 'app.js',
          expect: ['status-success', 'form.reset()'],
          snippet: `status.textContent = '¡Gracias, ' + data.name.trim() + '! Hemos recibido tu mensaje y te responderemos pronto.';
status.className = 'status status-success';
form.reset();`,
          fallback: `// TODO: confirmar el envío al usuario.`,
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------------ */
/* Dominios secundarios: archivos de código sin vista previa web             */
/* ------------------------------------------------------------------------ */

interface SimpleTask {
  title: string;
  description: string;
  file: string;
  misses: number;
  criteria: Omit<DemoCriterion, 'file'>[];
}

/** Genera plantillas sencillas (un marcador por criterio) para dominios sin preview. */
function simpleDomain(id: string, label: string, keywords: RegExp, tasks: SimpleTask[]): DemoDomain {
  const templates: Record<string, string> = {};
  const demoTasks: DemoTask[] = tasks.map((t) => {
    const header = `// ${t.file}\n// Generado por Develop (modo demo)\n\n`;
    templates[t.file] = (templates[t.file] ?? header) + t.criteria.map((c) => `@@${c.id}@@\n`).join('');
    return {
      title: t.title,
      description: t.description,
      misses: t.misses,
      criteria: t.criteria.map((c) => ({ ...c, file: t.file })),
    };
  });
  return { id, label, keywords, tasks: demoTasks, templates };
}

const authDomain = simpleDomain('auth', 'autenticación', /(login|auth|registro|sesi[oó]n|usuario|contraseña|password)/i, [
  {
    title: 'Crear la pantalla de inicio de sesión',
    description: 'Formulario de email y contraseña con estados de error.',
    file: 'app/login/page.tsx',
    misses: 0,
    criteria: [
      { id: 'auth-fields', description: 'Incluye campos de email y contraseña', expect: ['type="email"', 'type="password"'], snippet: 'export const fields = (\n  <>\n    <input type="email" name="email" />\n    <input type="password" name="password" />\n  </>\n);' },
      { id: 'auth-error', description: 'Muestra los errores con role="alert"', expect: ['role="alert"'], snippet: 'export const ErrorMessage = ({ error }: { error?: string }) => (error ? <p role="alert">{error}</p> : null);' },
    ],
  },
  {
    title: 'Validar credenciales en el servidor',
    description: 'Comprobar las credenciales sin exponer información sensible.',
    file: 'app/api/login/route.ts',
    misses: 2,
    criteria: [
      { id: 'auth-hash', description: 'Compara contraseñas con hash, nunca en claro', expect: ['verifyPassword('], snippet: 'const ok = await verifyPassword(password, user.passwordHash);' },
      { id: 'auth-generic', description: 'Usa un mensaje de error genérico', expect: ['Credenciales no válidas'], snippet: "if (!ok) return Response.json({ error: 'Credenciales no válidas' }, { status: UNAUTHORIZED });" },
      { id: 'auth-401', description: 'Declara el código 401 para fallos de autenticación', expect: ['const UNAUTHORIZED = 401'], snippet: 'const UNAUTHORIZED = 401;' },
    ],
  },
  {
    title: 'Gestionar la sesión del usuario',
    description: 'Emitir una cookie de sesión segura.',
    file: 'lib/session.ts',
    misses: 1,
    criteria: [
      { id: 'auth-httponly', description: 'La cookie es httpOnly', expect: ['httpOnly: true'], snippet: "cookies().set('session', token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: SESSION_SECONDS });" },
      { id: 'auth-expiry', description: 'La sesión expira', expect: ['const SESSION_SECONDS'], snippet: 'const SESSION_SECONDS = 60 * 60 * 8; // 8 horas' },
    ],
  },
]);

const apiDomain = simpleDomain('api', 'API REST', /(api|endpoint|rest|backend|servidor|crud)/i, [
  {
    title: 'Definir el modelo y el esquema de datos',
    description: 'Tipar la entidad principal y su validación de entrada.',
    file: 'lib/schema.ts',
    misses: 0,
    criteria: [
      { id: 'api-type', description: 'Declara el tipo de la entidad', expect: ['export interface Item'], snippet: 'export interface Item { id: string; name: string; createdAt: string }' },
      { id: 'api-parse', description: 'Incluye una función de validación de entrada', expect: ['export function parseItem('], snippet: "export function parseItem(input: unknown): Item {\n  if (typeof input !== 'object' || !input) throw new Error('invalid');\n  return input as Item;\n}" },
    ],
  },
  {
    title: 'Implementar los endpoints GET y POST',
    description: 'Crear el route handler con listado y creación.',
    file: 'app/api/items/route.ts',
    misses: 2,
    criteria: [
      { id: 'api-get', description: 'Expone GET para listar recursos', expect: ['export async function GET('], snippet: 'export async function GET() {\n  return Response.json(await repo.list());\n}' },
      { id: 'api-post', description: 'Expone POST para crear recursos', expect: ['export async function POST('], snippet: 'export async function POST(req: Request) {\n  const item = parseItem(await req.json());\n  return Response.json(await repo.create(item), { status: CREATED_STATUS });\n}' },
      { id: 'api-status', description: 'Declara el código 201 para creaciones', expect: ['const CREATED_STATUS = 201'], snippet: 'export const CREATED_STATUS = 201;' },
    ],
  },
  {
    title: 'Gestionar errores de la API',
    description: 'Responder con códigos HTTP adecuados ante entradas inválidas.',
    file: 'lib/http.ts',
    misses: 1,
    criteria: [
      { id: 'api-400', description: 'Responde 400 ante datos inválidos', expect: ['status: 400'], snippet: "export const badRequest = (msg: string) => Response.json({ error: msg }, { status: 400 });" },
      { id: 'api-catch', description: 'Captura excepciones inesperadas', expect: ['catch (error)'], snippet: "export async function safe(fn: () => Promise<Response>) {\n  try {\n    return await fn();\n  } catch (error) {\n    return Response.json({ error: 'internal' }, { status: 500 });\n  }\n}" },
    ],
  },
]);

const genericDomain = simpleDomain('generic', 'funcionalidad web', /.*/, [
  {
    title: 'Modelar los datos de la funcionalidad',
    description: 'Definir tipos y estado inicial.',
    file: 'lib/model.ts',
    misses: 0,
    criteria: [
      { id: 'gen-type', description: 'Declara los tipos del dominio', expect: ['export interface Entity'], snippet: 'export interface Entity { id: string; title: string; done: boolean }' },
      { id: 'gen-initial', description: 'Define un estado inicial', expect: ['export const initialState'], snippet: 'export const initialState: Entity[] = [];' },
    ],
  },
  {
    title: 'Implementar la lógica principal',
    description: 'Funciones puras para crear, actualizar y eliminar elementos.',
    file: 'lib/logic.ts',
    misses: 2,
    criteria: [
      { id: 'gen-add', description: 'Permite añadir elementos', expect: ['export function addEntity('], snippet: 'export function addEntity(list: Entity[], title: string): Entity[] {\n  return [...list, { id: crypto.randomUUID(), title, done: false }];\n}' },
      { id: 'gen-toggle', description: 'Permite actualizar elementos', expect: ['export function toggleEntity('], snippet: 'export function toggleEntity(list: Entity[], id: string): Entity[] {\n  return list.map((e) => (e.id === id ? { ...e, done: !e.done } : e));\n}' },
      { id: 'gen-remove', description: 'Permite eliminar elementos', expect: ['export function removeEntity('], snippet: 'export function removeEntity(list: Entity[], id: string): Entity[] {\n  return list.filter((e) => e.id !== id);\n}' },
    ],
  },
  {
    title: 'Construir la interfaz de usuario',
    description: 'Componente responsive que consume la lógica.',
    file: 'components/Feature.tsx',
    misses: 1,
    criteria: [
      { id: 'gen-list', description: 'Renderiza la lista con claves estables', expect: ['key={entity.id}'], snippet: 'export const List = ({ items }: { items: Entity[] }) => (\n  <ul>{items.map((entity) => <li key={entity.id}>{entity.title}</li>)}</ul>\n);' },
      { id: 'gen-empty', description: 'Muestra un estado vacío', expect: ['items.length === 0'], snippet: 'export const Empty = ({ items }: { items: Entity[] }) => (items.length === 0 ? <p>No hay elementos todavía.</p> : null);' },
    ],
  },
]);

export const DEMO_DOMAINS: DemoDomain[] = [contactDomain, authDomain, apiDomain, genericDomain];

export const CONTACT_DEMO_PROMPT =
  'Crear una página de contacto responsive con nombre, email, asunto y mensaje, validación de campos y confirmación al enviar';

export function pickDomain(prompt: string): DemoDomain {
  return DEMO_DOMAINS.find((d) => d.keywords.test(prompt)) ?? genericDomain;
}

export function findDemoTask(title: string): { domain: DemoDomain; task: DemoTask } | undefined {
  for (const domain of DEMO_DOMAINS) {
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
