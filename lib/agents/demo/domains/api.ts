import type { DemoDomain } from '../types';
import { pageCss, pageHtml } from './shared';

const HTML = pageHtml({
  title: 'API de productos',
  app: 'api',
  scriptsMarker: 'api-scripts',
  body: `  <main class="page">
    <header>
      <p class="eyebrow">API REST</p>
      <h1>API de productos</h1>
      <p class="lead">Endpoints <code>GET</code> y <code>POST /api/products</code> ejecutándose en el navegador, con una consola para probarlos.</p>
    </header>
    <section class="card console">
      <h2>Consola de peticiones</h2>
      <div class="presets" aria-label="Peticiones de ejemplo">
        <button type="button" class="secondary" data-preset="list">GET productos</button>
        <button type="button" class="secondary" data-preset="create">POST válido</button>
        <button type="button" class="secondary" data-preset="invalid">POST inválido</button>
        <button type="button" class="secondary" data-preset="missing">Ruta inexistente</button>
      </div>
      <form id="request-form" class="request-form">
        <select id="method" name="method" aria-label="Método">
          <option>GET</option>
          <option>POST</option>
        </select>
        <input id="path" name="path" value="/api/products" aria-label="Ruta" />
        <textarea id="body" name="body" rows="3" aria-label="Cuerpo JSON" placeholder='{"name": "Taza", "price": 9.5}'></textarea>
        <button type="submit">Enviar petición</button>
      </form>
      <div class="response">
        <p>Respuesta: <strong id="response-status">—</strong></p>
        <pre id="response-body">Envía una petición para ver la respuesta.</pre>
      </div>
    </section>
  </main>`,
});

const CSS = pageCss(
  '#0f8a7e',
  'api-responsive',
  `code { background: #eef1f6; padding: 1px 5px; border-radius: 5px; }
.console { display: flex; flex-direction: column; gap: 14px; }
.presets { display: flex; flex-wrap: wrap; gap: 8px; }
.request-form { display: grid; grid-template-columns: 110px 1fr; gap: 10px; }
.request-form textarea, .request-form button { grid-column: 1 / -1; }
.request-form button { justify-self: start; }
.response p { margin: 0 0 6px; }
pre { margin: 0; background: #151a2b; color: #d6e2ff; padding: 14px; border-radius: 10px; overflow: auto; font-size: 13px; }`,
);

const API = `// API REST de productos que se ejecuta en el navegador (almacén en memoria, sin red).
@@api-store@@
@@api-validate@@
@@api-201@@

function handleRequest(method, path, rawBody) {
  @@api-json@@
  @@api-get@@
  @@api-post@@
  @@api-404@@
}
`;

const CONSOLE = `// Consola para probar la API desde la página.
(function () {
  var form = document.getElementById('request-form');
  var statusEl = document.getElementById('response-status');
  var bodyEl = document.getElementById('response-body');
  var PRESETS = {
    list: ['GET', '/api/products', ''],
    create: ['POST', '/api/products', '{"name": "Taza de cerámica", "price": 9.5}'],
    invalid: ['POST', '/api/products', '{"name": "", "price": -3}'],
    missing: ['GET', '/api/orders', '']
  };

  function show(response) {
    statusEl.textContent = String(response.status);
    statusEl.className = response.status < 400 ? 'ok' : 'ko';
    bodyEl.textContent = JSON.stringify(response.body, null, 2);
  }

  @@api-console@@

  document.querySelectorAll('[data-preset]').forEach(function (button) {
    button.addEventListener('click', function () {
      var preset = PRESETS[button.getAttribute('data-preset')];
      form.elements.method.value = preset[0];
      form.elements.path.value = preset[1];
      form.elements.body.value = preset[2];
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  });
})();
`;

export const apiDomain: DemoDomain = {
  id: 'api',
  label: 'API REST',
  keywords: /(\bapi\b|endpoint|\brest\b|backend|crud)/i,
  templates: { 'index.html': HTML, 'styles.css': CSS, 'api.js': API, 'console.js': CONSOLE },
  tasks: [
    {
      title: 'Definir el modelo y el almacén de productos',
      description: 'Crear api.js con los datos iniciales en memoria y la validación de un producto.',
      misses: 0,
      criteria: [
        {
          id: 'api-store',
          description: 'Define un almacén en memoria con productos iniciales',
          file: 'api.js',
          expect: ['var products = [', 'var nextId = '],
          snippet: `var products = [
  { id: 1, name: 'Café en grano', price: 12.9 },
  { id: 2, name: 'Tetera de hierro', price: 34.5 },
  { id: 3, name: 'Molinillo manual', price: 27 }
];
var nextId = 4;`,
        },
        {
          id: 'api-validate',
          description: 'Valida nombre obligatorio y precio positivo',
          file: 'api.js',
          expect: ['function validateProduct(', "'El precio debe ser un número mayor que 0.'"],
          snippet: `function validateProduct(input) {
  var errors = [];
  if (!input || typeof input.name !== 'string' || !input.name.trim()) errors.push('El nombre es obligatorio.');
  if (!input || typeof input.price !== 'number' || !(input.price > 0)) errors.push('El precio debe ser un número mayor que 0.');
  return errors;
}`,
        },
      ],
    },
    {
      title: 'Implementar los endpoints GET y POST',
      description: 'Añadir handleRequest() con GET /api/products (listado) y POST /api/products (creación con validación).',
      misses: 2,
      criteria: [
        {
          id: 'api-get',
          description: 'GET /api/products devuelve el listado con 200',
          file: 'api.js',
          expect: ["method === 'GET' && path === '/api/products'"],
          snippet: `if (method === 'GET' && path === '/api/products') {
  return { status: 200, body: products };
}`,
        },
        {
          id: 'api-post',
          description: 'POST /api/products valida y crea el producto',
          file: 'api.js',
          expect: ["method === 'POST' && path === '/api/products'", 'status: 400, body: { errors: errors }'],
          snippet: `if (method === 'POST' && path === '/api/products') {
  var errors = validateProduct(body);
  if (errors.length) return { status: 400, body: { errors: errors } };
  var product = { id: nextId++, name: body.name.trim(), price: body.price };
  products.push(product);
  return { status: CREATED, body: product };
}`,
        },
        {
          id: 'api-201',
          description: 'Las creaciones responden con 201 Created',
          file: 'api.js',
          expect: ['var CREATED = 201;'],
          snippet: 'var CREATED = 201;',
          fallback: 'var CREATED = 200;',
        },
      ],
    },
    {
      title: 'Gestionar errores y crear la consola de pruebas',
      description: 'Responder 400 ante JSON inválido y 404 en rutas desconocidas; crear console.js y enlazar los scripts.',
      misses: 1,
      criteria: [
        {
          id: 'api-console',
          description: 'La consola envía la petición y muestra la respuesta',
          file: 'console.js',
          expect: ["form.addEventListener('submit'", 'show(handleRequest('],
          snippet: `form.addEventListener('submit', function (event) {
  event.preventDefault();
  show(handleRequest(form.elements.method.value, form.elements.path.value.trim(), form.elements.body.value));
});`,
        },
        {
          id: 'api-scripts',
          description: 'index.html carga api.js y console.js',
          file: 'index.html',
          expect: ['<script src="api.js"></script>', '<script src="console.js"></script>'],
          snippet: `<script src="api.js"></script>
<script src="console.js"></script>`,
        },
        {
          id: 'api-json',
          description: 'Responde 400 si el cuerpo no es JSON válido',
          file: 'api.js',
          expect: ["error: 'El cuerpo no es JSON válido.'"],
          snippet: `var body;
try {
  body = rawBody ? JSON.parse(rawBody) : {};
} catch (error) {
  return { status: 400, body: { error: 'El cuerpo no es JSON válido.' } };
}`,
          fallback: 'var body = rawBody ? JSON.parse(rawBody) : {};',
        },
        {
          id: 'api-404',
          description: 'Responde 404 en rutas desconocidas',
          file: 'api.js',
          expect: ['status: 404'],
          snippet: "return { status: 404, body: { error: 'Ruta no encontrada: ' + method + ' ' + path } };",
          fallback: 'return { status: 200, body: {} };',
        },
      ],
    },
  ],
};
