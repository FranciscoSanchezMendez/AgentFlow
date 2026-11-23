/**
 * Mejoras incrementales del modo demo: se aplican sobre el workspace de un hilo.
 *
 * Cada criterio es un PARCHE sobre los archivos existentes:
 *  - insertar un fragmento antes de una línea de anclaje (p. ej. `</body>`) o al final;
 *  - eliminar un bloque de líneas;
 *  - borrar un archivo.
 * Algunos criterios solo se aplican si el workspace cumple una condición (`when`),
 * por ejemplo integrar el calendario con el login únicamente si existe login.
 *
 * Una petición puede activar varias mejoras a la vez. Si no encaja con ninguna,
 * el modo demo NO inventa una implementación: lo dice y no toca archivos.
 *
 * Placeholders: `{{SLUG}}` (identificador estable de la petición) y
 * `{{PROMPT_JSON}}` (la petición como literal JSON seguro dentro de <script>).
 */
import { escapeHtml } from './catalog';

export interface PatchCriterion {
  id: string;
  description: string;
  file: string;
  /** Fragmentos que deben existir tras aplicar el parche. */
  expect?: string[];
  /** Fragmentos que NO deben existir tras aplicar el parche. */
  absent?: string[];
  /** Código a insertar. */
  snippet?: string;
  /** Se inserta antes de la primera línea que contenga alguno de estos textos; si no, al final. */
  before?: string[];
  /** Elimina el bloque desde la línea que contiene `from` hasta la que contiene `to` (incluidas). */
  remove?: { from: string; to?: string };
  /** Borra el archivo completo. */
  deleteFile?: boolean;
  /** Solo se aplica si el workspace cumple la condición. */
  when?: { file: string; includes?: string; missing?: boolean };
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

/* ------------------------------------------------------------------------ */
/* Eliminar la sección «Novedades»                                          */
/* ------------------------------------------------------------------------ */

const removeNews: Followup = {
  id: 'remove-news',
  label: 'eliminar «Novedades»',
  keywords: /((elimin|quit|borr|retir|suprim|saca)[a-záéíóú]*\b.*\b(nota|novedad))|((nota|novedad)[a-z]*\b.*\b(elimin|quit|borr|retir|suprim|sobra))/i,
  rationale: 'Quito la sección «Novedades»: su marcado, su script, sus estilos y el archivo changelog.js.',
  tasks: [
    {
      title: 'Eliminar la sección «Novedades»',
      description: 'Quitar de index.html la sección y su script, borrar sus estilos y eliminar changelog.js.',
      misses: 0,
      criteria: [
        {
          id: 'drop-news-section',
          description: 'index.html ya no contiene la sección «Novedades»',
          file: 'index.html',
          absent: ['id="novedades-list"'],
          remove: { from: '<section id="novedades"', to: '</section>' },
          when: { file: 'index.html', includes: 'id="novedades-list"' },
        },
        {
          id: 'drop-news-script',
          description: 'index.html ya no carga changelog.js',
          file: 'index.html',
          absent: ['<script src="changelog.js"></script>'],
          remove: { from: '<script src="changelog.js"></script>' },
          when: { file: 'index.html', includes: '<script src="changelog.js"></script>' },
        },
        {
          id: 'drop-news-styles',
          description: 'styles.css ya no tiene los estilos de «Novedades»',
          file: 'styles.css',
          absent: ['.af-changelog {'],
          remove: { from: '/* Novedades (mejora del hilo) */', to: '.af-changelog li' },
          when: { file: 'styles.css', includes: '.af-changelog {' },
        },
        {
          id: 'drop-news-file',
          description: 'changelog.js se ha eliminado del workspace',
          file: 'changelog.js',
          absent: ['addChangelogEntry('],
          deleteFile: true,
          when: { file: 'changelog.js', includes: 'addChangelogEntry(' },
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------------ */
/* Calendario para agendar sesiones de llamada                              */
/* ------------------------------------------------------------------------ */

const BOOKING_PAGE = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agenda de llamadas</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body data-agentflow-app="booking">
  <main class="page">
    <p class="eyebrow">Agenda</p>
    <h1>Agenda de sesiones de llamada</h1>
    <p class="muted">Elige un hueco libre de 30 minutos y reserva tu llamada.</p>
  </main>
</body>
</html>`;

const BOOKING_BASE_CSS = `:root { --accent: #3559e0; --text: #1c2033; --muted: #5d6479; }
* { box-sizing: border-box; }
body { margin: 0; background: #f4f5fa; color: var(--text); font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; }
.page { max-width: 960px; margin: 0 auto; padding: 32px 20px 0; }
.eyebrow { margin: 0; color: var(--accent); font-weight: 700; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
.muted { color: var(--muted); }
input { font: inherit; padding: 10px 12px; border: 1px solid #cfd3e1; border-radius: 10px; }
button { font: inherit; font-weight: 700; border: 0; border-radius: 10px; padding: 10px 18px; background: var(--accent); color: #fff; cursor: pointer; }
button.secondary { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
button:disabled { opacity: .5; cursor: not-allowed; }
[hidden] { display: none !important; }`;

const BOOKING_SECTION = `<section id="booking" class="booking" aria-labelledby="booking-title">
  <div class="booking-head">
    <h2 id="booking-title">Agenda una sesión de llamada</h2>
    <p id="booking-user" class="muted"></p>
  </div>
  <div class="booking-nav">
    <button type="button" id="week-prev" class="secondary">← Semana anterior</button>
    <strong id="week-label"></strong>
    <button type="button" id="week-next" class="secondary">Semana siguiente →</button>
  </div>
  <div id="booking-calendar" class="booking-calendar" aria-live="polite"></div>
  <form id="booking-form" class="booking-form" novalidate>
    <p>Hueco seleccionado: <strong id="booking-slot">ninguno</strong></p>
    <div class="field" id="booking-email-field">
      <label for="booking-email">Tu email</label>
      <input id="booking-email" name="bookingEmail" type="email" autocomplete="email" />
    </div>
    <div class="field">
      <label for="booking-topic">Motivo de la llamada</label>
      <input id="booking-topic" name="bookingTopic" />
    </div>
    <button type="submit">Reservar llamada</button>
    <p id="booking-status" class="booking-status" role="status"></p>
  </form>
  <h3>Reservas registradas</h3>
  <table id="reservations" class="reservations">
    <thead><tr><th>Fecha</th><th>Hora</th><th>Usuario</th><th>Motivo</th><th></th></tr></thead>
    <tbody></tbody>
  </table>
  <p id="reservations-empty" class="muted">Todavía no hay reservas.</p>
</section>`;

const BOOKING_CSS = `/* Agenda de llamadas (mejora del hilo) */
.booking { width: 100%; max-width: 960px; margin: 24px auto; padding: 22px; background: #fff; color: #1c2033; border-radius: 16px; box-shadow: 0 10px 30px rgba(28, 32, 51, 0.08); }
.booking-head h2 { margin: 0 0 4px; }
.booking-nav { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 14px 0; flex-wrap: wrap; }
.booking-calendar { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.booking-day h4 { margin: 0 0 6px; font-size: 13px; text-transform: capitalize; }
.booking-day .slots { display: flex; flex-direction: column; gap: 6px; }
.slot { font: inherit; font-size: 13px; font-weight: 600; padding: 6px; border-radius: 8px; border: 1px solid #cfd3e1; background: #f7f8fc; color: #1c2033; cursor: pointer; }
.slot[aria-pressed="true"] { background: #3559e0; color: #fff; border-color: #3559e0; }
.slot:disabled { background: #eceef4; color: #9aa0b4; cursor: not-allowed; text-decoration: line-through; }
.booking-form { display: grid; gap: 10px; margin: 16px 0; max-width: 420px; }
.booking-form .field { display: flex; flex-direction: column; gap: 6px; }
.booking-status { margin: 0; font-weight: 600; }
.booking-status.ok { color: #138a56; }
.booking-status.ko { color: #d93b3b; }
.reservations { width: 100%; border-collapse: collapse; font-size: 14px; }
.reservations th, .reservations td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #dfe2ec; }
@media (max-width: 720px) {
  .booking { padding: 16px; border-radius: 0; }
  .booking-calendar { grid-template-columns: 1fr 1fr; }
}`;

const AGENDA_SLOTS = `// Agenda de sesiones de llamada (lógica pura; los datos viven en la página, sin servidor).
var SLOT_MINUTES = 30;
var reservations = [];
var nextReservationId = 1;

// Huecos de 30 minutos, de lunes a viernes entre las 9:00 y las 17:00.
function slotsForDay(date) {
  var day = date.getDay();
  if (day === 0 || day === 6) return [];
  var slots = [];
  for (var minutes = 9 * 60; minutes < 17 * 60; minutes += SLOT_MINUTES) {
    var start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60);
    slots.push(start.toISOString());
  }
  return slots;
}

function isBooked(start) {
  return reservations.some(function (r) { return r.start === start; });
}`;

const AGENDA_BOOK = `function bookSlot(start, user, topic) {
  if (!user) return { ok: false, error: 'Indica quién reserva: inicia sesión o escribe tu email.' };
  if (slotsForDay(new Date(start)).indexOf(start) === -1) return { ok: false, error: 'Ese hueco no está disponible.' };
  if (new Date(start).getTime() <= Date.now()) return { ok: false, error: 'No se puede reservar en el pasado.' };
  if (isBooked(start)) return { ok: false, error: 'Ese hueco ya está reservado.' };
  var reservation = { id: nextReservationId++, start: start, user: user, topic: String(topic || '').trim() || 'Sin motivo', createdAt: new Date().toISOString() };
  reservations.push(reservation);
  return { ok: true, reservation: reservation };
}`;

const AGENDA_CANCEL = `function cancelReservation(id, user) {
  var reservation = reservations.find(function (r) { return r.id === id; });
  if (!reservation) return { ok: false, error: 'La reserva no existe.' };
  if (reservation.user !== user) return { ok: false, error: 'Solo quien hizo la reserva puede cancelarla.' };
  reservations = reservations.filter(function (r) { return r.id !== id; });
  return { ok: true };
}`;

const BOOKING_USER = String.raw`// Calendario de reservas: usuario que reserva e interfaz.
// Si la página tiene inicio de sesión (window.getSession), la reserva queda a
// nombre del usuario con sesión; si no, se usa el email del formulario.
function currentUser() {
  if (typeof window.getSession === 'function') {
    var session = window.getSession();
    return session ? session.user.email : null;
  }
  var email = document.getElementById('booking-email').value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}`;

const BOOKING_UI = `(function () {
  var form = document.getElementById('booking-form');
  var calendar = document.getElementById('booking-calendar');
  var status = document.getElementById('booking-status');
  var needsLogin = typeof window.getSession === 'function';
  var weekStart = startOfWeek(new Date());
  var selected = null;

  function startOfWeek(date) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function fmtDate(iso) { return new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }); }
  function fmtTime(iso) { return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
  function setStatus(text, ok) { status.textContent = text; status.className = 'booking-status ' + (ok ? 'ok' : 'ko'); }

  function renderUser() {
    var user = currentUser();
    document.getElementById('booking-email-field').hidden = needsLogin;
    document.getElementById('booking-user').textContent = needsLogin
      ? (user ? 'Sesión iniciada como ' + user + '. Tus reservas quedan registradas a tu nombre.' : 'Inicia sesión para reservar una llamada.')
      : 'Indica tu email para registrar la reserva.';
    form.querySelector('button[type="submit"]').disabled = needsLogin && !user;
  }

  function renderWeek() {
    calendar.innerHTML = '';
    var end = new Date(weekStart);
    end.setDate(end.getDate() + 4);
    document.getElementById('week-label').textContent =
      weekStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' – ' + end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    for (var i = 0; i < 5; i++) {
      var day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      var column = document.createElement('div');
      column.className = 'booking-day';
      var title = document.createElement('h4');
      title.textContent = day.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' });
      var list = document.createElement('div');
      list.className = 'slots';
      slotsForDay(day).forEach(function (start) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'slot';
        button.setAttribute('data-slot', start);
        button.textContent = fmtTime(start);
        button.disabled = isBooked(start) || new Date(start).getTime() <= Date.now();
        button.setAttribute('aria-pressed', String(start === selected));
        list.appendChild(button);
      });
      column.appendChild(title);
      column.appendChild(list);
      calendar.appendChild(column);
    }
  }

  function renderReservations() {
    var tbody = document.querySelector('#reservations tbody');
    tbody.innerHTML = '';
    var me = currentUser();
    reservations.slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; }).forEach(function (r) {
      var tr = document.createElement('tr');
      [fmtDate(r.start), fmtTime(r.start), r.user, r.topic].forEach(function (value) {
        var td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      var actions = document.createElement('td');
      if (me && r.user === me) {
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'secondary cancel-reservation';
        cancel.setAttribute('data-id', String(r.id));
        cancel.textContent = 'Cancelar';
        actions.appendChild(cancel);
      }
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    document.getElementById('reservations-empty').hidden = reservations.length > 0;
  }

  function renderAll() { renderUser(); renderWeek(); renderReservations(); }

  calendar.addEventListener('click', function (event) {
    var button = event.target.closest('[data-slot]');
    if (!button || button.disabled) return;
    selected = button.getAttribute('data-slot');
    document.getElementById('booking-slot').textContent = fmtDate(selected) + ' · ' + fmtTime(selected);
    renderWeek();
  });
  document.getElementById('week-prev').addEventListener('click', function () { weekStart.setDate(weekStart.getDate() - 7); renderWeek(); });
  document.getElementById('week-next').addEventListener('click', function () { weekStart.setDate(weekStart.getDate() + 7); renderWeek(); });
  document.querySelector('#reservations tbody').addEventListener('click', function (event) {
    var button = event.target.closest('.cancel-reservation');
    if (!button) return;
    var result = cancelReservation(Number(button.getAttribute('data-id')), currentUser());
    setStatus(result.ok ? 'Reserva cancelada.' : result.error, result.ok);
    renderAll();
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!selected) { setStatus('Selecciona un hueco del calendario.', false); return; }
    var result = bookSlot(selected, currentUser(), form.elements.bookingTopic.value);
    if (!result.ok) { setStatus(result.error, false); return; }
    setStatus('Reserva confirmada para ' + fmtDate(selected) + ' a las ' + fmtTime(selected) + '.', true);
    selected = null;
    document.getElementById('booking-slot').textContent = 'ninguno';
    form.elements.bookingTopic.value = '';
    renderAll();
  });
  // El login avisa al iniciar o cerrar sesión para actualizar el calendario.
  document.addEventListener('agentflow:session', renderAll);
  renderAll();
})();`;

const booking: Followup = {
  id: 'booking',
  label: 'calendario de reservas de llamadas',
  keywords: /(calendari|agend|reserv|reserb|\bcita|llamada|booking)/i,
  rationale:
    'Añado un calendario con huecos de 30 minutos para agendar llamadas: reservar, evitar dobles reservas, cancelar las propias y ver qué usuario ha hecho cada reserva. Si la página tiene inicio de sesión, se exige sesión y la reserva queda a nombre del usuario.',
  tasks: [
    {
      title: 'Agenda: preparar la página y el calendario',
      description: 'Añadir a index.html la sección de reservas (semana, huecos, formulario y reservas registradas) y sus estilos.',
      misses: 1,
      criteria: [
        {
          id: 'book-page',
          description: 'Existe una página base para la agenda',
          file: 'index.html',
          expect: ['<body data-agentflow-app="booking">'],
          snippet: BOOKING_PAGE,
          when: { file: 'index.html', missing: true },
        },
        {
          id: 'book-base-css',
          description: 'La página base tiene estilos',
          file: 'styles.css',
          expect: ['[hidden] { display: none !important; }'],
          snippet: BOOKING_BASE_CSS,
          when: { file: 'styles.css', missing: true },
        },
        {
          id: 'book-section',
          description: 'La página tiene calendario, formulario de reserva y lista de reservas',
          file: 'index.html',
          expect: ['id="booking-calendar"', 'id="booking-form"', 'id="reservations"'],
          snippet: BOOKING_SECTION,
          before: BODY_END,
        },
        {
          id: 'book-styles',
          description: 'El calendario tiene estilos y se adapta a móvil',
          file: 'styles.css',
          expect: ['.booking-calendar {', '.slot:disabled'],
          snippet: BOOKING_CSS,
        },
      ],
    },
    {
      title: 'Agenda: lógica de huecos y reservas',
      description: 'Crear agenda.js con los huecos de 30 minutos, la reserva sin solapamientos ni fechas pasadas y la cancelación.',
      misses: 2,
      criteria: [
        { id: 'agenda-slots', description: 'Genera huecos de 30 minutos en horario laboral', file: 'agenda.js', expect: ['function slotsForDay(', 'var SLOT_MINUTES = 30;'], snippet: AGENDA_SLOTS },
        { id: 'agenda-book', description: 'Reserva un hueco libre a nombre de un usuario, sin dobles reservas ni pasado', file: 'agenda.js', expect: ['function bookSlot(', "'Ese hueco ya está reservado.'"], snippet: AGENDA_BOOK },
        { id: 'agenda-cancel', description: 'Solo quien reservó puede cancelar', file: 'agenda.js', expect: ['function cancelReservation(', "'Solo quien hizo la reserva puede cancelarla.'"], snippet: AGENDA_CANCEL },
      ],
    },
    {
      title: 'Agenda: conectar el calendario con el usuario',
      description: 'Crear booking.js para pintar la semana, reservar y cancelar; identificar al usuario (sesión iniciada o email) y cargar los scripts.',
      misses: 1,
      criteria: [
        { id: 'booking-user', description: 'Identifica al usuario que reserva (sesión o email)', file: 'booking.js', expect: ['function currentUser(', "typeof window.getSession === 'function'"], snippet: BOOKING_USER },
        { id: 'booking-ui', description: 'Pinta la semana, permite reservar y cancelar y lista las reservas con su usuario', file: 'booking.js', expect: ["form.addEventListener('submit'", 'function renderReservations(', "document.addEventListener('agentflow:session', renderAll)"], snippet: BOOKING_UI },
        {
          id: 'booking-load',
          description: 'index.html carga agenda.js y booking.js',
          file: 'index.html',
          expect: ['<script src="agenda.js"></script>', '<script src="booking.js"></script>'],
          snippet: '<script src="agenda.js"></script>\n<script src="booking.js"></script>',
          before: BODY_END,
        },
        {
          id: 'booking-login-event',
          description: 'Al iniciar sesión, el calendario se habilita para ese usuario',
          file: 'app.js',
          expect: ["new CustomEvent('agentflow:session', { detail: user })"],
          snippet: "document.dispatchEvent(new CustomEvent('agentflow:session', { detail: user }));",
          before: ["document.getElementById('welcome-name').textContent = user.name;"],
          when: { file: 'app.js', includes: 'function showWelcome(' },
        },
        {
          id: 'booking-logout-event',
          description: 'Al cerrar sesión, el calendario deja de permitir reservas',
          file: 'app.js',
          expect: ["new CustomEvent('agentflow:session', { detail: null })"],
          snippet: "document.dispatchEvent(new CustomEvent('agentflow:session', { detail: null }));",
          before: ['welcome.hidden = true;'],
          when: { file: 'app.js', includes: "logoutButton.addEventListener('click'" },
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------------ */
/* Modo oscuro                                                               */
/* ------------------------------------------------------------------------ */

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
          snippet: `html.theme-dark .card, html.theme-dark .contact, html.theme-dark .kpi, html.theme-dark .offer, html.theme-dark .section.alt, html.theme-dark .site-header, html.theme-dark .site-footer, html.theme-dark .af-changelog, html.theme-dark .booking { background: #1c1f2b; color: #e6e8ef; box-shadow: none; }
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

/* ------------------------------------------------------------------------ */
/* Pie de página                                                             */
/* ------------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------------ */
/* Registro de novedades (solo si se pide expresamente)                      */
/* ------------------------------------------------------------------------ */

const changelog: Followup = {
  id: 'changelog',
  label: 'registro de novedades',
  keywords: /(registr[a-z]* (en|de) (las )?novedades|a[ñn]ad[a-z]* (a|en) (las )?novedades|changelog|registro de cambios)/i,
  rationale: 'Añado la petición a la sección «Novedades» de la página (la creo si no existe).',
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
          description: 'La petición aparece en «Novedades»',
          file: 'changelog.js',
          expect: ["addChangelogEntry('{{SLUG}}'"],
          snippet: "addChangelogEntry('{{SLUG}}', {{PROMPT_JSON}});",
        },
      ],
    },
  ],
};

/** Orden de aplicación cuando una petición activa varias mejoras. */
export const FOLLOWUPS: Followup[] = [removeNews, booking, darkMode, footer, changelog];

/** Mejoras que solicita la petición (puede haber varias o ninguna). */
export function pickFollowups(prompt: string): Followup[] {
  return FOLLOWUPS.filter((f) => f.keywords.test(prompt));
}

export function findFollowupTask(title: string): { followup: Followup; task: FollowupTask } | undefined {
  for (const followup of FOLLOWUPS) {
    const task = followup.tasks.find((t) => t.title === title);
    if (task) return { followup, task };
  }
  return undefined;
}

/** ¿Se aplica el criterio a este workspace? */
export function criterionApplies(criterion: PatchCriterion, files: Record<string, string>): boolean {
  const when = criterion.when;
  if (!when) return true;
  const content = files[when.file];
  if (when.missing) return content === undefined;
  if (when.includes !== undefined) return content !== undefined && content.includes(when.includes);
  return true;
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
 * Aplica un parche de inserción o eliminación sobre el contenido de un archivo.
 * Si el archivo ya cumple el criterio, no lo toca (los parches son idempotentes).
 * Los borrados de archivo (`deleteFile`) los gestiona quien llama.
 */
export function applyPatch(content: string, criterion: PatchCriterion): string {
  const lines = content === '' ? [] : content.replace(/\n$/, '').split('\n');

  if (criterion.remove) {
    if ((criterion.absent ?? []).every((fragment) => !content.includes(fragment))) return content;
    const start = lines.findIndex((line) => line.includes(criterion.remove!.from));
    if (start === -1) return content;
    let end = start;
    if (criterion.remove.to) {
      const found = lines.findIndex((line, i) => i >= start && line.includes(criterion.remove!.to!));
      end = found === -1 ? start : found;
    }
    lines.splice(start, end - start + 1);
    // Evita dejar dos líneas en blanco seguidas donde estaba el bloque.
    if (start > 0 && start < lines.length && lines[start - 1].trim() === '' && lines[start].trim() === '') lines.splice(start, 1);
    return lines.length ? lines.join('\n') + '\n' : '';
  }

  if (!criterion.snippet || (criterion.expect ?? []).every((fragment) => content.includes(fragment))) return content;
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
