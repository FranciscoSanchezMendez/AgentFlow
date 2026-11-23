import type { DemoDomain } from '../types';
import { pageCss, pageHtml } from './shared';

const HTML = pageHtml({
  title: 'Panel de ventas',
  app: 'dashboard',
  scriptsMarker: 'dash-scripts',
  body: `  <main class="page">
    <header>
      <p class="eyebrow">Dashboard</p>
      <h1>{{TITLE}}</h1>
      <p class="lead">Métricas, tabla ordenable y filtrable y ventas por región.</p>
    </header>
    @@dash-layout@@
  </main>`,
});

const CSS = pageCss(
  '#7a3cf0',
  'dash-responsive',
  `.page { max-width: 1080px; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 16px; }
.kpi { background: var(--card); border-radius: 14px; padding: 16px; box-shadow: 0 6px 18px rgba(28, 32, 51, 0.06); }
.kpi span { display: block; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
.kpi strong { font-size: 24px; }
.grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; align-items: start; }
.toolbar { display: flex; gap: 10px; margin-bottom: 12px; }
.toolbar input { flex: 1; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 9px 8px; border-bottom: 1px solid var(--line); }
th { cursor: pointer; user-select: none; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .5px; }
th[aria-sort="ascending"]::after { content: ' ▲'; }
th[aria-sort="descending"]::after { content: ' ▼'; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
.bar-row { display: grid; grid-template-columns: 70px 1fr; gap: 8px; align-items: center; margin-bottom: 10px; font-size: 13px; }
.bar { height: 22px; background: var(--accent); border-radius: 6px; color: #fff; font-size: 11px; padding: 3px 6px; white-space: nowrap; }`,
);

const DATA = `// Datos de ejemplo del panel (ventas por mes, región y producto).
@@dash-data@@
`;

const DASH = `// Panel de ventas: métricas, tabla ordenable y filtrable y gráfico de barras.
var state = { query: '', sortKey: 'month', sortDir: 1 };
var renderers = [];

@@dash-format@@

@@dash-kpis@@

@@dash-table@@

@@dash-chart@@

function visibleRows() {
  var q = state.query.trim().toLowerCase();
  return SALES.filter(function (row) {
    return !q || (row.region + ' ' + row.product).toLowerCase().indexOf(q) !== -1;
  }).sort(function (a, b) {
    var x = a[state.sortKey];
    var y = b[state.sortKey];
    return (x > y ? 1 : x < y ? -1 : 0) * state.sortDir;
  });
}

function update() {
  var rows = visibleRows();
  renderers.forEach(function (render) { render(rows); });
}

@@dash-filter@@

@@dash-sort@@

update();
`;

export const dashboardDomain: DemoDomain = {
  id: 'dashboard',
  label: 'dashboard de datos',
  keywords: /(dashboard|tabla|ventas|estad[ií]stic|m[eé]tricas|kpi|panel de control|gr[aá]fic|informe)/i,
  templates: { 'index.html': HTML, 'styles.css': CSS, 'data.js': DATA, 'dashboard.js': DASH },
  tasks: [
    {
      title: 'Maquetar el panel y preparar los datos',
      description: 'Crear index.html con indicadores, tabla y gráfico; data.js con las ventas de ejemplo; styles.css responsive.',
      misses: 0,
      criteria: [
        {
          id: 'dash-layout',
          description: 'Incluye indicadores, tabla con buscador y zona de gráfico',
          file: 'index.html',
          expect: ['id="kpis"', 'id="sales-table"', 'id="filter"', 'id="chart"'],
          snippet: `<section id="kpis" class="kpis" aria-label="Indicadores">
  <div class="kpi"><span>Ingresos</span><strong id="kpi-revenue">—</strong></div>
  <div class="kpi"><span>Unidades</span><strong id="kpi-units">—</strong></div>
  <div class="kpi"><span>Mejor región</span><strong id="kpi-top">—</strong></div>
</section>
<div class="grid">
  <section class="card">
    <div class="toolbar">
      <input id="filter" type="search" placeholder="Filtrar por región o producto" aria-label="Filtrar" />
    </div>
    <table id="sales-table">
      <thead>
        <tr>
          <th data-key="month">Mes</th>
          <th data-key="region">Región</th>
          <th data-key="product">Producto</th>
          <th data-key="units">Unidades</th>
          <th data-key="revenue">Ingresos</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </section>
  <section class="card">
    <h2>Ingresos por región</h2>
    <div id="chart"></div>
  </section>
</div>`,
        },
        {
          id: 'dash-data',
          description: 'Define las ventas de ejemplo',
          file: 'data.js',
          expect: ['var SALES = ['],
          snippet: `var SALES = [
  { month: '2026-01', region: 'Norte', product: 'Café', units: 120, revenue: 1560 },
  { month: '2026-01', region: 'Sur', product: 'Té', units: 80, revenue: 760 },
  { month: '2026-02', region: 'Centro', product: 'Café', units: 150, revenue: 1950 },
  { month: '2026-02', region: 'Norte', product: 'Bollería', units: 210, revenue: 945.5 },
  { month: '2026-03', region: 'Sur', product: 'Café', units: 95, revenue: 1235 },
  { month: '2026-03', region: 'Este', product: 'Té', units: 60, revenue: 570 },
  { month: '2026-04', region: 'Centro', product: 'Bollería', units: 180, revenue: 810 },
  { month: '2026-04', region: 'Este', product: 'Café', units: 130, revenue: 1690.25 }
];`,
        },
        {
          id: 'dash-responsive',
          description: 'Reorganiza indicadores y paneles en móvil',
          file: 'styles.css',
          expect: ['@media (max-width: 760px)'],
          snippet: `@media (max-width: 760px) {
  .kpis, .grid { grid-template-columns: 1fr; }
  table { font-size: 13px; }
}`,
        },
      ],
    },
    {
      title: 'Calcular métricas y pintar la tabla',
      description: 'Crear dashboard.js con los indicadores (ingresos, unidades, mejor región), la tabla y el formato de moneda.',
      misses: 2,
      criteria: [
        {
          id: 'dash-kpis',
          description: 'Calcula ingresos y unidades totales y la mejor región',
          file: 'dashboard.js',
          expect: ['function computeKpis(', "document.getElementById('kpi-top')"],
          snippet: `function computeKpis(rows) {
  var byRegion = {};
  var revenue = 0;
  var units = 0;
  rows.forEach(function (row) {
    revenue += row.revenue;
    units += row.units;
    byRegion[row.region] = (byRegion[row.region] || 0) + row.revenue;
  });
  var top = Object.keys(byRegion).sort(function (a, b) { return byRegion[b] - byRegion[a]; })[0] || '—';
  return { revenue: revenue, units: units, top: top };
}
renderers.push(function (rows) {
  var kpis = computeKpis(rows);
  document.getElementById('kpi-revenue').textContent = formatEuro(kpis.revenue);
  document.getElementById('kpi-units').textContent = kpis.units.toLocaleString('es-ES');
  document.getElementById('kpi-top').textContent = kpis.top;
});`,
        },
        {
          id: 'dash-table',
          description: 'Pinta las filas de la tabla',
          file: 'dashboard.js',
          expect: ['function renderTable('],
          snippet: `function renderTable(rows) {
  var tbody = document.querySelector('#sales-table tbody');
  tbody.innerHTML = '';
  rows.forEach(function (row) {
    var tr = document.createElement('tr');
    [row.month, row.region, row.product].forEach(function (value) {
      var td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    });
    [row.units.toLocaleString('es-ES'), formatEuro(row.revenue)].forEach(function (value) {
      var td = document.createElement('td');
      td.className = 'num';
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}
renderers.push(renderTable);`,
        },
        {
          id: 'dash-format',
          description: 'Formatea los importes en euros con formato español',
          file: 'dashboard.js',
          expect: ["style: 'currency', currency: 'EUR'"],
          snippet: "function formatEuro(value) { return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); }",
          fallback: "function formatEuro(value) { return value + ' EUR'; }",
        },
      ],
    },
    {
      title: 'Añadir filtro, ordenación y gráfico',
      description: 'Filtrar y ordenar la tabla, dibujar las ventas por región y enlazar los scripts en index.html.',
      misses: 1,
      criteria: [
        {
          id: 'dash-filter',
          description: 'Filtra por región o producto al escribir',
          file: 'dashboard.js',
          expect: ["document.getElementById('filter').addEventListener('input'"],
          snippet: `document.getElementById('filter').addEventListener('input', function (event) {
  state.query = event.target.value;
  update();
});`,
        },
        {
          id: 'dash-sort',
          description: 'Ordena al pulsar la cabecera de una columna',
          file: 'dashboard.js',
          expect: ["header.addEventListener('click'", "header.setAttribute('aria-sort'"],
          snippet: `document.querySelectorAll('#sales-table th').forEach(function (header) {
  header.addEventListener('click', function () {
    var key = header.getAttribute('data-key');
    state.sortDir = state.sortKey === key ? -state.sortDir : 1;
    state.sortKey = key;
    document.querySelectorAll('#sales-table th').forEach(function (h) { h.removeAttribute('aria-sort'); });
    header.setAttribute('aria-sort', state.sortDir === 1 ? 'ascending' : 'descending');
    update();
  });
});`,
        },
        {
          id: 'dash-scripts',
          description: 'index.html carga data.js y dashboard.js',
          file: 'index.html',
          expect: ['<script src="data.js"></script>', '<script src="dashboard.js"></script>'],
          snippet: `<script src="data.js"></script>
<script src="dashboard.js"></script>`,
        },
        {
          id: 'dash-chart',
          description: 'Dibuja una barra de ingresos por región',
          file: 'dashboard.js',
          expect: ['function renderChart('],
          snippet: `function renderChart(rows) {
  var totals = {};
  rows.forEach(function (row) { totals[row.region] = (totals[row.region] || 0) + row.revenue; });
  var max = Math.max.apply(null, Object.keys(totals).map(function (k) { return totals[k]; }).concat([1]));
  var chart = document.getElementById('chart');
  chart.innerHTML = '';
  Object.keys(totals).sort().forEach(function (region) {
    var row = document.createElement('div');
    row.className = 'bar-row';
    var label = document.createElement('span');
    label.textContent = region;
    var bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.width = Math.max(8, (totals[region] / max) * 100) + '%';
    bar.textContent = formatEuro(totals[region]);
    row.appendChild(label);
    row.appendChild(bar);
    chart.appendChild(row);
  });
}
renderers.push(renderChart);`,
        },
      ],
    },
  ],
};
