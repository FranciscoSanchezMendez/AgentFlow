import type { DemoDomain } from '../types';
import { pageCss, pageHtml } from './shared';

const HTML = pageHtml({
  title: 'Calculadora de propinas',
  app: 'calculator',
  scriptsMarker: 'calc-scripts',
  body: `  <main class="page calc-page">
    <section class="card calc-card">
      <p class="eyebrow">Calculadora</p>
      <h1>{{TITLE}}</h1>
      <p class="lead">Calcula la propina y cuánto paga cada persona.</p>
      <form id="calc-form" class="calc-form" novalidate>
        @@calc-fields@@
        <p id="calc-error" class="alert" role="alert" hidden></p>
        <button id="reset-button" type="button" class="secondary">Reiniciar</button>
      </form>
      @@calc-results@@
    </section>
  </main>`,
});

const CSS = pageCss(
  '#e0662f',
  'calc-responsive',
  `.calc-card { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
.calc-card > p, .calc-card > h1 { grid-column: 1 / -1; margin-bottom: 0; }
.calc-form { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.tips { display: flex; flex-wrap: wrap; gap: 8px; border: 0; padding: 0; margin: 0; }
.tips label { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; padding: 6px 10px; border: 1px solid var(--line); border-radius: 10px; }
.results { background: #1f2438; color: #fff; border-radius: 14px; padding: 20px; display: grid; gap: 14px; }
.results p { margin: 0; color: #b9c0d8; font-size: 14px; }
.results strong { display: block; font-size: 28px; color: #fff; }`,
);

const CALC = `// Lógica de la calculadora (funciones puras, sin dependencias).
@@calc-round@@

@@calc-compute@@
`;

const APP = `// Conecta el formulario con la lógica de la calculadora.
(function () {
  var form = document.getElementById('calc-form');
  var errorBox = document.getElementById('calc-error');
  var resetButton = document.getElementById('reset-button');
  var money = function (value) { return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); };

  function readForm() {
    var tip = form.querySelector('input[name="tip"]:checked');
    return {
      bill: parseFloat(String(form.elements.bill.value).replace(',', '.')),
      tip: tip ? Number(tip.value) : 0,
      people: Number(form.elements.people.value)
    };
  }

  function update() {
    var data = readForm();
    var result = calculateTip(data.bill, data.tip, data.people);
    @@calc-error@@
    document.getElementById('tip-amount').textContent = money(result.tip);
    document.getElementById('total').textContent = money(result.total);
    document.getElementById('total-per-person').textContent = money(result.perPerson);
  }

  @@calc-update@@
  @@calc-reset@@
})();
`;

export const calculatorDomain: DemoDomain = {
  id: 'calculator',
  label: 'calculadora',
  keywords: /(calculadora|propina|dividir la cuenta|calcular)/i,
  templates: { 'index.html': HTML, 'styles.css': CSS, 'calc.js': CALC, 'app.js': APP },
  tasks: [
    {
      title: 'Maquetar la calculadora',
      description: 'Crear index.html con importe, porcentaje de propina, número de personas y panel de resultados; styles.css responsive.',
      misses: 0,
      criteria: [
        {
          id: 'calc-fields',
          description: 'Incluye importe, propina (10/15/20 %) y número de personas',
          file: 'index.html',
          expect: ['id="bill"', 'name="tip"', 'id="people"'],
          snippet: `<div class="field">
  <label for="bill">Importe de la cuenta (€)</label>
  <input id="bill" name="bill" inputmode="decimal" placeholder="0,00" />
</div>
<fieldset class="tips">
  <legend class="muted">Propina</legend>
  <label><input type="radio" name="tip" value="10" checked /> 10 %</label>
  <label><input type="radio" name="tip" value="15" /> 15 %</label>
  <label><input type="radio" name="tip" value="20" /> 20 %</label>
</fieldset>
<div class="field">
  <label for="people">Personas</label>
  <input id="people" name="people" type="number" min="1" step="1" value="1" />
</div>`,
        },
        {
          id: 'calc-results',
          description: 'Muestra propina, total y total por persona',
          file: 'index.html',
          expect: ['id="tip-amount"', 'id="total-per-person"'],
          snippet: `<section class="results" aria-live="polite">
  <p>Propina <strong id="tip-amount">0,00 €</strong></p>
  <p>Total <strong id="total">0,00 €</strong></p>
  <p>Por persona <strong id="total-per-person">0,00 €</strong></p>
</section>`,
        },
        {
          id: 'calc-responsive',
          description: 'Pasa a una columna en móvil',
          file: 'styles.css',
          expect: ['@media (max-width: 640px)'],
          snippet: `@media (max-width: 640px) {
  .calc-card { grid-template-columns: 1fr; }
}`,
        },
      ],
    },
    {
      title: 'Implementar el cálculo',
      description: 'Crear calc.js con calculateTip(): propina, total y reparto por persona, con validación y redondeo a céntimos.',
      misses: 2,
      criteria: [
        {
          id: 'calc-compute',
          description: 'Calcula propina, total y total por persona',
          file: 'calc.js',
          expect: ['function calculateTip(', 'perPerson: round2(total / people)'],
          snippet: `function calculateTip(bill, tipPercent, people) {
  @@calc-validate@@
  var tip = bill * tipPercent / 100;
  var total = bill + tip;
  return { ok: true, tip: round2(tip), total: round2(total), perPerson: round2(total / people) };
}`,
        },
        {
          id: 'calc-round',
          description: 'Redondea los importes a céntimos',
          file: 'calc.js',
          expect: ['Number.EPSILON'],
          snippet: 'function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }',
          fallback: 'function round2(value) { return value; }',
        },
        {
          id: 'calc-validate',
          description: 'Rechaza importes no positivos y un número de personas no válido',
          file: 'calc.js',
          expect: ["'Introduce un importe mayor que 0.'", "'El número de personas debe ser un entero mayor que 0.'"],
          snippet: `if (!(bill > 0)) return { ok: false, error: 'Introduce un importe mayor que 0.' };
if (!(people >= 1) || Math.floor(people) !== people) {
  return { ok: false, error: 'El número de personas debe ser un entero mayor que 0.' };
}`,
        },
      ],
    },
    {
      title: 'Conectar la interfaz de la calculadora',
      description: 'Crear app.js para recalcular al escribir, mostrar errores y reiniciar; enlazar los scripts en index.html.',
      misses: 1,
      criteria: [
        {
          id: 'calc-update',
          description: 'Recalcula al cambiar cualquier campo',
          file: 'app.js',
          expect: ["form.addEventListener('input', update)"],
          snippet: `form.addEventListener('input', update);
form.addEventListener('change', update);`,
        },
        {
          id: 'calc-error',
          description: 'Muestra el error de validación y no pinta resultados inválidos',
          file: 'app.js',
          expect: ['errorBox.textContent = result.error;'],
          snippet: `errorBox.hidden = result.ok;
if (!result.ok) {
  errorBox.textContent = result.error;
  return;
}`,
        },
        {
          id: 'calc-scripts',
          description: 'index.html carga calc.js y app.js',
          file: 'index.html',
          expect: ['<script src="calc.js"></script>', '<script src="app.js"></script>'],
          snippet: `<script src="calc.js"></script>
<script src="app.js"></script>`,
        },
        {
          id: 'calc-reset',
          description: 'El botón Reiniciar limpia el formulario y los resultados',
          file: 'app.js',
          expect: ["resetButton.addEventListener('click'"],
          snippet: `resetButton.addEventListener('click', function () {
  form.reset();
  errorBox.hidden = true;
  ['tip-amount', 'total', 'total-per-person'].forEach(function (id) {
    document.getElementById(id).textContent = money(0);
  });
});`,
        },
      ],
    },
  ],
};
