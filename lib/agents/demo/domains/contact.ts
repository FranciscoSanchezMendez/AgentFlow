import type { DemoDomain } from '../types';

/** Página de contacto (HTML + CSS + JS sin dependencias). Es la demo principal. */
const CONTACT_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Contacto</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body data-agentflow-app="contact">
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

export const contactDomain: DemoDomain = {
  id: 'contact',
  label: 'página de contacto',
  keywords: /(formulario|\bform\b|contacto|contact|encuesta|suscripci)/i,
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
