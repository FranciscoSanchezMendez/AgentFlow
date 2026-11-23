import type { DemoDomain } from '../types';
import { pageCss, pageHtml } from './shared';

const HTML = pageHtml({
  title: '{{TITLE}}',
  app: 'landing',
  scriptsMarker: 'land-scripts',
  body: `  @@land-nav@@
  <main>
    @@land-hero@@
    <section id="servicios" class="section">
      <div class="page">
        <h2>Lo que ofrecemos</h2>
        <div id="offers" class="offers"></div>
      </div>
    </section>
    <section id="horario" class="section alt">
      <div class="page">
        <h2>Horario <span id="open-badge" class="badge"></span></h2>
        <table id="hours" class="hours"><tbody></tbody></table>
      </div>
    </section>
    <section id="contacto" class="section">
      <div class="page">
        <h2>Contacto</h2>
        <p class="muted">Escríbenos a hola@ejemplo.com o visítanos en Calle Mayor 1.</p>
      </div>
    </section>
  </main>`,
});

const CSS = pageCss(
  '#b3541e',
  'land-responsive',
  `.site-header { position: sticky; top: 0; z-index: 5; background: rgba(255, 255, 255, 0.95); border-bottom: 1px solid var(--line); }
.site-header .page { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; }
.brand { font-weight: 800; color: var(--text); text-decoration: none; }
.nav-links { display: flex; gap: 18px; list-style: none; margin: 0; padding: 0; }
.nav-links a { color: var(--text); text-decoration: none; font-weight: 600; }
.menu-button { display: none; }
.hero { background: linear-gradient(135deg, #2b1a10, #6b3a1c); color: #fff; padding: 72px 0; }
.hero h1 { font-size: 40px; }
.hero p { color: #f1dccd; max-width: 560px; }
.cta { display: inline-block; margin-top: 12px; background: #ffb36b; color: #2b1a10; padding: 12px 20px; border-radius: 10px; font-weight: 800; text-decoration: none; }
.section { padding: 48px 0; }
.section.alt { background: #fff; }
.offers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.offer { background: var(--card); border-radius: 14px; padding: 18px; box-shadow: 0 6px 18px rgba(28, 32, 51, 0.06); }
.offer h3 { margin: 0 0 6px; }
.offer p { margin: 0; color: var(--muted); font-size: 14px; }
.price { display: block; margin-top: 10px; font-weight: 800; color: var(--accent); }
.badge { font-size: 13px; padding: 3px 10px; border-radius: 99px; vertical-align: middle; }
.badge.open { background: #e8f7ef; color: var(--ok); }
.badge.closed { background: #fdecec; color: var(--danger); }
.hours { border-collapse: collapse; min-width: 280px; }
.hours td { padding: 8px 18px 8px 0; border-bottom: 1px solid var(--line); }`,
);

const CONTENT = `// Contenido de la página: servicios y horario de apertura.
@@land-offers@@

@@land-hours@@

@@land-open@@
`;

const APP = `// Pinta el contenido dinámico y gestiona la navegación.
(function () {
  @@land-render@@

  @@land-menu@@

  @@land-badge@@
})();
`;

export const landingDomain: DemoDomain = {
  id: 'landing',
  label: 'landing page',
  keywords: /(landing|p[aá]gina de inicio|p[aá]gina web para|web para|cafeter|restaurante|bar\b|tienda|negocio|empresa|portfolio|portafolio|presentaci[oó]n|corporativ)/i,
  templates: { 'index.html': HTML, 'styles.css': CSS, 'content.js': CONTENT, 'app.js': APP },
  tasks: [
    {
      title: 'Maquetar la landing page',
      description: 'Crear index.html con cabecera y navegación, portada con llamada a la acción y secciones; styles.css responsive.',
      misses: 0,
      criteria: [
        {
          id: 'land-nav',
          description: 'La navegación enlaza con servicios, horario y contacto',
          file: 'index.html',
          expect: ['href="#servicios"', 'href="#horario"', 'href="#contacto"', 'aria-controls="nav-links"'],
          snippet: `<header class="site-header">
  <nav class="page" aria-label="Principal">
    <a class="brand" href="#">{{TITLE}}</a>
    <button class="menu-button" type="button" aria-expanded="false" aria-controls="nav-links">Menú</button>
    <ul id="nav-links" class="nav-links">
      <li><a href="#servicios">Servicios</a></li>
      <li><a href="#horario">Horario</a></li>
      <li><a href="#contacto">Contacto</a></li>
    </ul>
  </nav>
</header>`,
        },
        {
          id: 'land-hero',
          description: 'Tiene portada con título y llamada a la acción',
          file: 'index.html',
          expect: ['class="hero"', 'class="cta"'],
          snippet: `<section class="hero">
  <div class="page">
    <p class="eyebrow">Bienvenido</p>
    <h1>{{TITLE}}</h1>
    <p>Calidad, cercanía y un buen servicio. Descubre lo que podemos hacer por ti.</p>
    <a class="cta" href="#contacto">Contactar</a>
  </div>
</section>`,
        },
        {
          id: 'land-responsive',
          description: 'En móvil apila las tarjetas y usa un menú desplegable',
          file: 'styles.css',
          expect: ['@media (max-width: 720px)', '.nav-links.open'],
          snippet: `@media (max-width: 720px) {
  .offers { grid-template-columns: 1fr; }
  .hero h1 { font-size: 30px; }
  .menu-button { display: inline-block; padding: 8px 12px; }
  .nav-links { display: none; position: absolute; top: 100%; left: 0; right: 0; flex-direction: column; gap: 0; background: #fff; border-bottom: 1px solid var(--line); }
  .nav-links.open { display: flex; }
  .nav-links a { display: block; padding: 12px 20px; }
}`,
        },
      ],
    },
    {
      title: 'Preparar el contenido y el horario',
      description: 'Crear content.js con los servicios, el horario semanal y una función que indique si está abierto a una hora dada.',
      misses: 1,
      criteria: [
        {
          id: 'land-offers',
          description: 'Define al menos tres servicios con precio',
          file: 'content.js',
          expect: ['var OFFERS = ['],
          snippet: `var OFFERS = [
  { title: 'Desayunos', text: 'Café de especialidad, tostadas y bollería del día.', price: 'desde 3,50 €' },
  { title: 'Menú del día', text: 'Primero, segundo, postre y bebida.', price: '12,90 €' },
  { title: 'Para llevar', text: 'Pide online y recógelo sin esperas.', price: 'sin recargo' }
];`,
        },
        {
          id: 'land-hours',
          description: 'Define el horario de los siete días',
          file: 'content.js',
          expect: ['var HOURS = ['],
          snippet: `// day: 0 = domingo … 6 = sábado; open/close en minutos desde las 00:00 (null = cerrado)
var HOURS = [
  { day: 1, label: 'Lunes', open: 480, close: 1200 },
  { day: 2, label: 'Martes', open: 480, close: 1200 },
  { day: 3, label: 'Miércoles', open: 480, close: 1200 },
  { day: 4, label: 'Jueves', open: 480, close: 1200 },
  { day: 5, label: 'Viernes', open: 480, close: 1320 },
  { day: 6, label: 'Sábado', open: 540, close: 1320 },
  { day: 0, label: 'Domingo', open: null, close: null }
];`,
        },
        {
          id: 'land-open',
          description: 'Calcula si está abierto en una fecha y hora',
          file: 'content.js',
          expect: ['function isOpenAt(', 'minutes >= today.open && minutes < today.close'],
          snippet: `function isOpenAt(date) {
  var today = HOURS.find(function (h) { return h.day === date.getDay(); });
  if (!today || today.open === null) return false;
  var minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= today.open && minutes < today.close;
}`,
          fallback: 'function isOpenAt(date) { return true; }',
        },
      ],
    },
    {
      title: 'Pintar el contenido y añadir la interacción',
      description: 'Crear app.js para pintar servicios y horario, el menú móvil y el indicador de abierto/cerrado; enlazar los scripts.',
      misses: 1,
      criteria: [
        {
          id: 'land-render',
          description: 'Pinta los servicios y el horario',
          file: 'app.js',
          expect: ["document.getElementById('offers')", "document.querySelector('#hours tbody')"],
          snippet: `var offers = document.getElementById('offers');
OFFERS.forEach(function (offer) {
  var card = document.createElement('article');
  card.className = 'offer';
  card.innerHTML = '<h3></h3><p></p><span class="price"></span>';
  card.querySelector('h3').textContent = offer.title;
  card.querySelector('p').textContent = offer.text;
  card.querySelector('.price').textContent = offer.price;
  offers.appendChild(card);
});
var tbody = document.querySelector('#hours tbody');
var time = function (m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
HOURS.forEach(function (h) {
  var tr = document.createElement('tr');
  tr.innerHTML = '<td></td><td></td>';
  tr.children[0].textContent = h.label;
  tr.children[1].textContent = h.open === null ? 'Cerrado' : time(h.open) + ' – ' + time(h.close);
  tbody.appendChild(tr);
});`,
        },
        {
          id: 'land-menu',
          description: 'El botón de menú abre y cierra la navegación en móvil',
          file: 'app.js',
          expect: ["menuButton.setAttribute('aria-expanded'"],
          snippet: `var menuButton = document.querySelector('.menu-button');
var links = document.getElementById('nav-links');
menuButton.addEventListener('click', function () {
  var open = links.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
});`,
        },
        {
          id: 'land-scripts',
          description: 'index.html carga content.js y app.js',
          file: 'index.html',
          expect: ['<script src="content.js"></script>', '<script src="app.js"></script>'],
          snippet: `<script src="content.js"></script>
<script src="app.js"></script>`,
        },
        {
          id: 'land-badge',
          description: 'Indica si está abierto ahora mismo',
          file: 'app.js',
          expect: ['isOpenAt(new Date())'],
          snippet: `var badge = document.getElementById('open-badge');
var openNow = isOpenAt(new Date());
badge.textContent = openNow ? 'Abierto ahora' : 'Cerrado ahora';
badge.className = 'badge ' + (openNow ? 'open' : 'closed');`,
        },
      ],
    },
  ],
};
