import type { DemoDomain } from '../types';
import { pageCss, pageHtml } from './shared';

const HTML = pageHtml({
  title: '{{TITLE}}',
  app: 'list',
  scriptsMarker: 'list-scripts',
  body: `  <main class="page list-page">
    <section class="card">
      <p class="eyebrow">Aplicación</p>
      <h1>{{TITLE}}</h1>
      <p class="lead">Petición: «{{PROMPT}}»</p>
      @@list-form@@
      @@list-filters@@
      <ul id="items" class="items" aria-live="polite"></ul>
      <p id="empty" class="muted empty" hidden>No hay elementos que mostrar.</p>
      <p id="counter" class="muted"></p>
    </section>
  </main>`,
});

const CSS = pageCss(
  '#2f7de0',
  'list-responsive',
  `.list-page { max-width: 680px; }
.add-form { display: flex; gap: 10px; margin-bottom: 14px; }
.add-form input { flex: 1; }
.filters { display: flex; gap: 8px; margin-bottom: 12px; }
.filters button { background: transparent; color: var(--muted); border: 1px solid var(--line); padding: 6px 12px; }
.filters button[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
.items { list-style: none; margin: 0; padding: 0; }
.item { display: flex; align-items: center; gap: 10px; padding: 10px 4px; border-bottom: 1px solid var(--line); }
.item span { flex: 1; }
.item.done span { text-decoration: line-through; color: var(--muted); }
.item .remove { background: transparent; color: var(--danger); padding: 4px 8px; }
.empty { padding: 16px 0; }`,
);

const STORE = `// Estado y operaciones de la lista (funciones puras).
var nextItemId = 4;
var items = [
  { id: 1, title: 'Revisar los requisitos', done: true },
  { id: 2, title: 'Preparar la primera versión', done: false },
  { id: 3, title: 'Publicar los cambios', done: false }
];

@@list-add@@

@@list-toggle@@

@@list-remove@@

function filterItems(list, filter) {
  if (filter === 'pending') return list.filter(function (item) { return !item.done; });
  if (filter === 'done') return list.filter(function (item) { return item.done; });
  return list;
}
`;

const APP = `// Interfaz de la lista: alta, completar, eliminar y filtrar.
(function () {
  var form = document.getElementById('add-form');
  var input = document.getElementById('new-item');
  var list = document.getElementById('items');
  var currentFilter = 'all';

  function render() {
    var visible = filterItems(items, currentFilter);
    list.innerHTML = '';
    @@list-render@@
    document.getElementById('counter').textContent = items.filter(function (i) { return !i.done; }).length + ' pendiente(s) de ' + items.length;
  }

  @@list-events@@

  @@list-filter-ui@@

  render();
})();
`;

export const listDomain: DemoDomain = {
  id: 'list',
  label: 'aplicación web de lista',
  keywords: /.*/,
  templates: { 'index.html': HTML, 'styles.css': CSS, 'store.js': STORE, 'app.js': APP },
  tasks: [
    {
      title: 'Maquetar la aplicación',
      description: 'Crear index.html con el formulario de alta, los filtros y la lista; styles.css responsive.',
      misses: 0,
      criteria: [
        {
          id: 'list-form',
          description: 'Incluye un formulario para añadir elementos',
          file: 'index.html',
          expect: ['id="add-form"', 'id="new-item"'],
          snippet: `<form id="add-form" class="add-form">
  <label for="new-item" class="muted" hidden>Nuevo elemento</label>
  <input id="new-item" name="title" placeholder="Añade un elemento…" autocomplete="off" />
  <button type="submit">Añadir</button>
</form>`,
        },
        {
          id: 'list-filters',
          description: 'Incluye filtros Todos / Pendientes / Completados',
          file: 'index.html',
          expect: ['data-filter="all"', 'data-filter="pending"', 'data-filter="done"'],
          snippet: `<div class="filters" role="group" aria-label="Filtrar">
  <button type="button" data-filter="all" aria-pressed="true">Todos</button>
  <button type="button" data-filter="pending" aria-pressed="false">Pendientes</button>
  <button type="button" data-filter="done" aria-pressed="false">Completados</button>
</div>`,
        },
        {
          id: 'list-responsive',
          description: 'Se adapta a móvil',
          file: 'styles.css',
          expect: ['@media (max-width: 520px)'],
          snippet: `@media (max-width: 520px) {
  .add-form { flex-direction: column; }
  .filters { flex-wrap: wrap; }
}`,
        },
      ],
    },
    {
      title: 'Implementar las operaciones de la lista',
      description: 'Crear store.js con las funciones para añadir, completar y eliminar elementos.',
      misses: 2,
      criteria: [
        {
          id: 'list-add',
          description: 'Añade elementos ignorando los títulos vacíos',
          file: 'store.js',
          expect: ['function addItem(', 'if (!clean) return items;'],
          snippet: `function addItem(title) {
  var clean = String(title).trim();
  if (!clean) return items;
  items = items.concat([{ id: nextItemId++, title: clean, done: false }]);
  return items;
}`,
        },
        {
          id: 'list-toggle',
          description: 'Marca y desmarca elementos como completados',
          file: 'store.js',
          expect: ['function toggleItem('],
          snippet: `function toggleItem(id) {
  items = items.map(function (item) { return item.id === id ? { id: item.id, title: item.title, done: !item.done } : item; });
  return items;
}`,
        },
        {
          id: 'list-remove',
          description: 'Elimina elementos',
          file: 'store.js',
          expect: ['function removeItem('],
          snippet: `function removeItem(id) {
  items = items.filter(function (item) { return item.id !== id; });
  return items;
}`,
        },
      ],
    },
    {
      title: 'Conectar la interfaz de la lista',
      description: 'Crear app.js para pintar la lista, añadir, completar, eliminar y filtrar; enlazar los scripts.',
      misses: 1,
      criteria: [
        {
          id: 'list-render',
          description: 'Pinta los elementos y un estado vacío',
          file: 'app.js',
          expect: ["document.getElementById('empty').hidden = visible.length !== 0;", "li.setAttribute('data-id'"],
          snippet: `document.getElementById('empty').hidden = visible.length !== 0;
visible.forEach(function (item) {
  var li = document.createElement('li');
  li.className = 'item' + (item.done ? ' done' : '');
  li.setAttribute('data-id', String(item.id));
  li.innerHTML = '<input type="checkbox" aria-label="Completado" /><span></span><button type="button" class="remove" aria-label="Eliminar">✕</button>';
  li.querySelector('input').checked = item.done;
  li.querySelector('span').textContent = item.title;
  list.appendChild(li);
});`,
        },
        {
          id: 'list-events',
          description: 'Añade, completa y elimina desde la interfaz',
          file: 'app.js',
          expect: ["form.addEventListener('submit'", "list.addEventListener('click'"],
          snippet: `form.addEventListener('submit', function (event) {
  event.preventDefault();
  addItem(input.value);
  input.value = '';
  render();
});
list.addEventListener('click', function (event) {
  var li = event.target.closest('li');
  if (!li) return;
  var id = Number(li.getAttribute('data-id'));
  if (event.target.classList.contains('remove')) removeItem(id);
  else if (event.target.matches('input[type="checkbox"]')) toggleItem(id);
  else return;
  render();
});`,
        },
        {
          id: 'list-scripts',
          description: 'index.html carga store.js y app.js',
          file: 'index.html',
          expect: ['<script src="store.js"></script>', '<script src="app.js"></script>'],
          snippet: `<script src="store.js"></script>
<script src="app.js"></script>`,
        },
        {
          id: 'list-filter-ui',
          description: 'Los botones de filtro cambian los elementos visibles',
          file: 'app.js',
          expect: ["currentFilter = button.getAttribute('data-filter');"],
          snippet: `document.querySelectorAll('[data-filter]').forEach(function (button) {
  button.addEventListener('click', function () {
    currentFilter = button.getAttribute('data-filter');
    document.querySelectorAll('[data-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
    render();
  });
});`,
        },
      ],
    },
  ],
};
