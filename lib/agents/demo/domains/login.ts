import type { DemoDomain } from '../types';
import { pageCss, pageHtml } from './shared';

const HTML = pageHtml({
  title: 'Iniciar sesión',
  app: 'login',
  scriptsMarker: 'login-scripts',
  body: `  <main class="page login-page">
    <section class="card login-card">
      <p class="eyebrow">Acceso</p>
      <h1>Inicia sesión</h1>
      <p class="lead">Entra con tu cuenta para continuar.</p>
      <form id="login-form" class="login-form" novalidate>
        @@login-fields@@
        @@login-alert@@
        <button type="submit">Entrar</button>
        <p class="muted hint">Usuario de prueba de la demo: demo@agentflow.dev · Demo1234!</p>
      </form>
      <section id="welcome" class="welcome" hidden>
        <p class="success">Sesión iniciada correctamente.</p>
        <h2>¡Hola, <span id="welcome-name"></span>!</h2>
        <p class="muted">Tu sesión caduca en 8 horas.</p>
        <button id="logout" type="button" class="secondary">Cerrar sesión</button>
      </section>
    </section>
  </main>`,
});

const CSS = pageCss(
  '#3559e0',
  'login-responsive',
  `.login-page { display: grid; place-items: center; min-height: 100vh; }
.login-card { width: 100%; max-width: 420px; }
.login-form { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.hint { margin: 0; font-size: 12px; }
.welcome { display: flex; flex-direction: column; gap: 10px; }`,
);

const AUTH = `// Autenticación simulada en el navegador: usuario de demostración, sin servidor.
@@auth-generic@@
var USERS = [{ email: 'demo@agentflow.dev', name: 'Demo', passwordHash: hashPassword('Demo1234!') }];

// Hash djb2 (suficiente para la demo; en producción usar bcrypt/argon2 en el servidor).
function hashPassword(value) {
  var hash = 5381;
  for (var i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  return 'h' + hash.toString(16);
}

function authenticate(email, password) {
  @@auth-required@@
  var user = USERS.find(function (u) { return u.email === email.trim().toLowerCase(); });
  @@auth-hash@@
  return { ok: true, user: { email: user.email, name: user.name } };
}
`;

const APP = `// Inicio de sesión en el navegador (simulado: no hay servidor ni datos reales).
(function () {
  var SESSION_MS = 8 * 60 * 60 * 1000; // 8 horas
  var form = document.getElementById('login-form');
  var errorBox = document.getElementById('login-error');
  var welcome = document.getElementById('welcome');
  var logoutButton = document.getElementById('logout');
  var session = null;
  window.getSession = function () { return session; };

  function showWelcome(user) {
    form.hidden = true;
    welcome.hidden = false;
    document.getElementById('welcome-name').textContent = user.name;
  }

  @@login-submit@@

  @@login-logout@@
})();
`;

export const loginDomain: DemoDomain = {
  id: 'login',
  label: 'inicio de sesión',
  keywords: /(login|iniciar sesi[oó]n|inicio de sesi[oó]n|autentica|auth\b|registro de usuarios|contraseña|password)/i,
  templates: { 'index.html': HTML, 'styles.css': CSS, 'auth.js': AUTH, 'app.js': APP },
  tasks: [
    {
      title: 'Maquetar la pantalla de inicio de sesión',
      description: 'Crear index.html con los campos de email y contraseña, una zona de error accesible y styles.css responsive.',
      misses: 0,
      criteria: [
        {
          id: 'login-fields',
          description: 'Incluye email y contraseña con etiquetas accesibles',
          file: 'index.html',
          expect: ['type="email"', 'type="password"', 'for="password"'],
          snippet: `<div class="field">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="username" />
</div>
<div class="field">
  <label for="password">Contraseña</label>
  <input id="password" name="password" type="password" autocomplete="current-password" />
</div>`,
        },
        {
          id: 'login-alert',
          description: 'Muestra los errores en una zona con role="alert"',
          file: 'index.html',
          expect: ['id="login-error"', 'role="alert"'],
          snippet: '<p id="login-error" class="alert" role="alert" hidden></p>',
        },
        {
          id: 'login-responsive',
          description: 'Se adapta a pantallas pequeñas',
          file: 'styles.css',
          expect: ['@media (max-width: 480px)'],
          snippet: `@media (max-width: 480px) {
  .login-card { padding: 18px; border-radius: 0; box-shadow: none; }
  .login-page { padding: 0; }
}`,
        },
      ],
    },
    {
      title: 'Validar las credenciales',
      description: 'Crear auth.js con authenticate(): campos obligatorios, comparación de la contraseña por hash y error genérico.',
      misses: 2,
      criteria: [
        {
          id: 'auth-required',
          description: 'Rechaza email o contraseña vacíos',
          file: 'auth.js',
          expect: ["'Introduce tu email y tu contraseña.'"],
          snippet: "if (!email.trim() || !password) return { ok: false, error: 'Introduce tu email y tu contraseña.' };",
        },
        {
          id: 'auth-generic',
          description: 'Usa un mensaje de error genérico que no revela si el usuario existe',
          file: 'auth.js',
          expect: ["var GENERIC_ERROR = 'Credenciales no válidas.';"],
          snippet: "var GENERIC_ERROR = 'Credenciales no válidas.';",
        },
        {
          id: 'auth-hash',
          description: 'Comprueba la contraseña comparando hashes',
          file: 'auth.js',
          expect: ['hashPassword(password) !== user.passwordHash'],
          snippet: `if (!user || hashPassword(password) !== user.passwordHash) {
  return { ok: false, error: GENERIC_ERROR };
}`,
          fallback: "if (!user) return { ok: false, error: 'No existe ningún usuario con ese email.' };",
        },
      ],
    },
    {
      title: 'Gestionar el inicio y el cierre de sesión',
      description: 'Crear app.js para autenticar al enviar, mostrar errores, guardar la sesión con caducidad y cerrar sesión; enlazar los scripts.',
      misses: 1,
      criteria: [
        {
          id: 'login-submit',
          description: 'Autentica al enviar y muestra el error si falla',
          file: 'app.js',
          expect: ["form.addEventListener('submit'", 'authenticate(form.elements.email.value'],
          snippet: `form.addEventListener('submit', function (event) {
  event.preventDefault();
  var result = authenticate(form.elements.email.value, form.elements.password.value);
  if (!result.ok) {
    errorBox.textContent = result.error;
    errorBox.hidden = false;
    form.elements.password.value = '';
    return;
  }
  errorBox.hidden = true;
  @@login-session@@
  showWelcome(result.user);
});`,
        },
        {
          id: 'login-logout',
          description: 'Permite cerrar sesión',
          file: 'app.js',
          expect: ["logoutButton.addEventListener('click'", 'welcome.hidden = true;'],
          snippet: `logoutButton.addEventListener('click', function () {
  session = null;
  welcome.hidden = true;
  form.hidden = false;
  form.reset();
});`,
        },
        {
          id: 'login-scripts',
          description: 'index.html carga auth.js y app.js',
          file: 'index.html',
          expect: ['<script src="auth.js"></script>', '<script src="app.js"></script>'],
          snippet: `<script src="auth.js"></script>
<script src="app.js"></script>`,
        },
        {
          id: 'login-session',
          description: 'Guarda la sesión con fecha de caducidad',
          file: 'app.js',
          expect: ['expiresAt: Date.now() + SESSION_MS'],
          snippet: 'session = { user: result.user, expiresAt: Date.now() + SESSION_MS };',
          fallback: '// TODO: guardar la sesión.',
        },
      ],
    },
  ],
};
