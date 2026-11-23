/**
 * Catálogo de plantillas del modo demo.
 *
 * Cada dominio describe las tareas que el Orchestrator generaría, los criterios
 * de aceptación que verifica Testing y el fragmento de código con el que Develop
 * satisface cada criterio. `misses` indica cuántos criterios "olvida" Develop en
 * el primer intento: así se observa el ciclo real Develop ⇄ Testing.
 */

export interface DemoCriterion {
  id: string;
  description: string;
  expect: string[];
  snippet: string;
}

export interface DemoTask {
  title: string;
  description: string;
  file: string;
  misses: number;
  criteria: DemoCriterion[];
}

export interface DemoDomain {
  id: string;
  label: string;
  keywords: RegExp;
  tasks: DemoTask[];
}

const formDomain: DemoDomain = {
  id: 'form',
  label: 'formulario web',
  keywords: /(formulario|form|contacto|contact|encuesta|suscrip)/i,
  tasks: [
    {
      title: 'Crear el componente del formulario',
      description: 'Maquetar el formulario con campos accesibles y botón de envío.',
      file: 'components/ContactForm.tsx',
      misses: 0,
      criteria: [
        {
          id: 'form-fields',
          description: 'Incluye los campos nombre, email y mensaje',
          expect: ['name="name"', 'name="email"', 'name="message"'],
          snippet:
            '  <input id="name" name="name" />\n  <input id="email" name="email" type="email" />\n  <textarea id="message" name="message" />',
        },
        {
          id: 'form-a11y',
          description: 'Cada campo tiene una etiqueta accesible',
          expect: ['htmlFor="name"', 'htmlFor="email"', 'htmlFor="message"'],
          snippet:
            '  <label htmlFor="name">Nombre</label>\n  <label htmlFor="email">Email</label>\n  <label htmlFor="message">Mensaje</label>',
        },
        {
          id: 'form-submit',
          description: 'Dispone de un botón de envío',
          expect: ['type="submit"'],
          snippet: '  <button type="submit">Enviar</button>',
        },
      ],
    },
    {
      title: 'Validar los datos del formulario',
      description: 'Validar en cliente los campos obligatorios, el email y la longitud del mensaje.',
      file: 'lib/validateContact.ts',
      misses: 2,
      criteria: [
        {
          id: 'val-required',
          description: 'Rechaza campos obligatorios vacíos',
          expect: ['if (!data.name.trim())'],
          snippet: "  if (!data.name.trim()) errors.name = 'El nombre es obligatorio';",
        },
        {
          id: 'val-email',
          description: 'Valida el formato del email',
          expect: ['EMAIL_PATTERN.test('],
          snippet:
            "  const EMAIL_PATTERN = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\n  if (!EMAIL_PATTERN.test(data.email)) errors.email = 'Email no válido';",
        },
        {
          id: 'val-length',
          description: 'Exige un mensaje de al menos 10 caracteres',
          expect: ['MIN_MESSAGE_LENGTH'],
          snippet:
            "  const MIN_MESSAGE_LENGTH = 10;\n  if (data.message.length < MIN_MESSAGE_LENGTH) errors.message = 'Mensaje demasiado corto';",
        },
      ],
    },
    {
      title: 'Gestionar el envío y la respuesta',
      description: 'Enviar los datos a la API, mostrar estado de carga y mensaje de confirmación.',
      file: 'components/useContactSubmit.ts',
      misses: 1,
      criteria: [
        {
          id: 'send-fetch',
          description: 'Envía los datos a /api/contact',
          expect: ["fetch('/api/contact'"],
          snippet:
            "  const res = await fetch('/api/contact', { method: 'POST', body: JSON.stringify(data) });",
        },
        {
          id: 'send-loading',
          description: 'Muestra un estado de carga durante el envío',
          expect: ['setSending(true)', 'setSending(false)'],
          snippet: '  setSending(true);\n  try { /* envío */ } finally { setSending(false); }',
        },
        {
          id: 'send-feedback',
          description: 'Comunica el resultado con un mensaje accesible',
          expect: ['role="status"'],
          snippet: '  <p role="status">{statusMessage}</p>',
        },
      ],
    },
  ],
};

const apiDomain: DemoDomain = {
  id: 'api',
  label: 'API REST',
  keywords: /(api|endpoint|rest|backend|servidor|crud)/i,
  tasks: [
    {
      title: 'Definir el modelo y el esquema de datos',
      description: 'Tipar la entidad principal y su validación de entrada.',
      file: 'lib/schema.ts',
      misses: 0,
      criteria: [
        {
          id: 'api-type',
          description: 'Declara el tipo de la entidad',
          expect: ['export interface Item'],
          snippet: 'export interface Item { id: string; name: string; createdAt: string }',
        },
        {
          id: 'api-parse',
          description: 'Incluye una función de validación de entrada',
          expect: ['export function parseItem('],
          snippet:
            "export function parseItem(input: unknown): Item { if (typeof input !== 'object' || !input) throw new Error('invalid'); return input as Item; }",
        },
      ],
    },
    {
      title: 'Implementar los endpoints GET y POST',
      description: 'Crear el route handler con listado y creación.',
      file: 'app/api/items/route.ts',
      misses: 2,
      criteria: [
        {
          id: 'api-get',
          description: 'Expone GET para listar recursos',
          expect: ['export async function GET('],
          snippet: 'export async function GET() { return Response.json(await repo.list()); }',
        },
        {
          id: 'api-post',
          description: 'Expone POST para crear recursos',
          expect: ['export async function POST('],
          snippet:
            'export async function POST(req: Request) { const item = parseItem(await req.json()); return Response.json(await repo.create(item), { status: 201 }); }',
        },
        {
          id: 'api-status',
          description: 'Declara el código 201 para creaciones',
          expect: ['const CREATED_STATUS = 201'],
          snippet: 'export const CREATED_STATUS = 201;',
        },
      ],
    },
    {
      title: 'Gestionar errores de la API',
      description: 'Responder con códigos HTTP adecuados ante entradas inválidas.',
      file: 'lib/http.ts',
      misses: 1,
      criteria: [
        {
          id: 'api-400',
          description: 'Responde 400 ante datos inválidos',
          expect: ['status: 400'],
          snippet: "export const badRequest = (msg: string) => Response.json({ error: msg }, { status: 400 });",
        },
        {
          id: 'api-catch',
          description: 'Captura excepciones inesperadas',
          expect: ['catch (error)'],
          snippet:
            "export async function safe(fn: () => Promise<Response>) { try { return await fn(); } catch (error) { return Response.json({ error: 'internal' }, { status: 500 }); } }",
        },
      ],
    },
  ],
};

const authDomain: DemoDomain = {
  id: 'auth',
  label: 'autenticación',
  keywords: /(login|auth|registro|sesi[oó]n|usuario|contraseña|password)/i,
  tasks: [
    {
      title: 'Crear la pantalla de inicio de sesión',
      description: 'Formulario de email y contraseña con estados de error.',
      file: 'app/login/page.tsx',
      misses: 0,
      criteria: [
        {
          id: 'auth-fields',
          description: 'Incluye campos de email y contraseña',
          expect: ['type="email"', 'type="password"'],
          snippet: '  <input type="email" name="email" />\n  <input type="password" name="password" />',
        },
        {
          id: 'auth-error',
          description: 'Muestra los errores con role="alert"',
          expect: ['role="alert"'],
          snippet: '  {error && <p role="alert">{error}</p>}',
        },
      ],
    },
    {
      title: 'Validar credenciales en el servidor',
      description: 'Comprobar las credenciales sin exponer información sensible.',
      file: 'app/api/login/route.ts',
      misses: 2,
      criteria: [
        {
          id: 'auth-hash',
          description: 'Compara contraseñas con hash, nunca en claro',
          expect: ['verifyPassword('],
          snippet: '  const ok = await verifyPassword(password, user.passwordHash);',
        },
        {
          id: 'auth-generic',
          description: 'Usa un mensaje de error genérico',
          expect: ['Credenciales no válidas'],
          snippet: "  if (!ok) return Response.json({ error: 'Credenciales no válidas' }, { status: 401 });",
        },
        {
          id: 'auth-401',
          description: 'Devuelve 401 cuando falla la autenticación',
          expect: ['const UNAUTHORIZED = 401'],
          snippet: '  const UNAUTHORIZED = 401;',
        },
      ],
    },
    {
      title: 'Gestionar la sesión del usuario',
      description: 'Emitir una cookie de sesión segura.',
      file: 'lib/session.ts',
      misses: 1,
      criteria: [
        {
          id: 'auth-httponly',
          description: 'La cookie es httpOnly',
          expect: ['httpOnly: true'],
          snippet: "  cookies().set('session', token, { httpOnly: true, secure: true, sameSite: 'lax' });",
        },
        {
          id: 'auth-expiry',
          description: 'La sesión expira',
          expect: ['maxAge'],
          snippet: '  const maxAge = 60 * 60 * 8; // 8 horas',
        },
      ],
    },
  ],
};

const genericDomain: DemoDomain = {
  id: 'generic',
  label: 'funcionalidad web',
  keywords: /.*/,
  tasks: [
    {
      title: 'Modelar los datos de la funcionalidad',
      description: 'Definir tipos y estado inicial.',
      file: 'lib/model.ts',
      misses: 0,
      criteria: [
        {
          id: 'gen-type',
          description: 'Declara los tipos del dominio',
          expect: ['export interface Entity'],
          snippet: 'export interface Entity { id: string; title: string; done: boolean }',
        },
        {
          id: 'gen-initial',
          description: 'Define un estado inicial',
          expect: ['export const initialState'],
          snippet: 'export const initialState: Entity[] = [];',
        },
      ],
    },
    {
      title: 'Implementar la lógica principal',
      description: 'Funciones puras para crear, actualizar y eliminar elementos.',
      file: 'lib/logic.ts',
      misses: 2,
      criteria: [
        {
          id: 'gen-add',
          description: 'Permite añadir elementos',
          expect: ['export function addEntity('],
          snippet:
            'export function addEntity(list: Entity[], title: string): Entity[] { return [...list, { id: crypto.randomUUID(), title, done: false }]; }',
        },
        {
          id: 'gen-toggle',
          description: 'Permite actualizar elementos',
          expect: ['export function toggleEntity('],
          snippet:
            'export function toggleEntity(list: Entity[], id: string): Entity[] { return list.map((e) => (e.id === id ? { ...e, done: !e.done } : e)); }',
        },
        {
          id: 'gen-remove',
          description: 'Permite eliminar elementos',
          expect: ['export function removeEntity('],
          snippet:
            'export function removeEntity(list: Entity[], id: string): Entity[] { return list.filter((e) => e.id !== id); }',
        },
      ],
    },
    {
      title: 'Construir la interfaz de usuario',
      description: 'Componente responsive que consume la lógica.',
      file: 'components/Feature.tsx',
      misses: 1,
      criteria: [
        {
          id: 'gen-list',
          description: 'Renderiza la lista con claves estables',
          expect: ['key={entity.id}'],
          snippet: '  {items.map((entity) => <li key={entity.id}>{entity.title}</li>)}',
        },
        {
          id: 'gen-empty',
          description: 'Muestra un estado vacío',
          expect: ['items.length === 0'],
          snippet: '  {items.length === 0 && <p>No hay elementos todavía.</p>}',
        },
      ],
    },
  ],
};

export const DEMO_DOMAINS: DemoDomain[] = [formDomain, authDomain, apiDomain, genericDomain];

export function pickDomain(prompt: string): DemoDomain {
  return DEMO_DOMAINS.find((d) => d.keywords.test(prompt)) ?? genericDomain;
}

export function findDemoTask(title: string): DemoTask | undefined {
  for (const domain of DEMO_DOMAINS) {
    const task = domain.tasks.find((t) => t.title === title);
    if (task) return task;
  }
  return undefined;
}
