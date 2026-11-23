/**
 * Pruebas de interacción que se ejecutan DENTRO de la vista previa, en un iframe
 * oculto con `sandbox="allow-scripts"` (origen opaco: sin acceso a la app, a sus
 * cookies ni a la red, por la CSP del documento). Usan la página como lo haría
 * una persona —rellenan, pulsan, envían— y comprueban el resultado en el DOM.
 * Los resultados se envían a la app con `postMessage`.
 *
 * La batería se elige según `<body data-agentflow-app="…">`. Las páginas sin ese
 * atributo (p. ej. generadas por un modelo real) reciben una prueba de humo.
 */

export const PREVIEW_MESSAGE_SOURCE = 'agentflow-preview';

export interface PreviewTestResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface PreviewTestMessage {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  type: 'tests';
  suite: string;
  results: PreviewTestResult[];
  note?: string;
}

/** Se inyecta en <head> para registrar los errores de JavaScript desde el principio. */
export const PREVIEW_ERROR_CAPTURE_SCRIPT = `window.__previewErrors = [];
window.addEventListener('error', function (event) { window.__previewErrors.push(String(event.message || event.error || 'Error')); });`;

export const PREVIEW_TEST_SCRIPT = String.raw`
(function () {
  var results = [];
  function $(selector) { return document.querySelector(selector); }
  function all(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }
  function shown(el) { return !!el && !el.closest('[hidden]'); }
  function submit(form) { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
  function fire(el, type) { el.dispatchEvent(new Event(type, { bubbles: true })); }
  function check(name, fn) {
    try {
      var r = fn();
      results.push({ name: name, passed: !!r.ok, detail: r.detail || '' });
    } catch (e) {
      results.push({ name: name, passed: false, detail: 'Error al ejecutar la prueba: ' + (e && e.message ? e.message : e) });
    }
  }
  function yesNo(ok, good, bad) { return { ok: ok, detail: ok ? good : bad }; }

  var SUITES = {
    contact: function () {
      var form = $('form');
      if (!form) throw new Error('No hay formulario');
      var names = ['name', 'email', 'subject', 'message'];
      function el(n) { return form.elements[n] || null; }
      function fill(values) { names.forEach(function (n) { if (el(n)) el(n).value = values[n] || ''; }); }
      function invalid(n) { return !!el(n) && el(n).getAttribute('aria-invalid') === 'true'; }
      var valid = { name: 'Ana García', email: 'ana@example.com', subject: 'Presupuesto', message: 'Me gustaría recibir información sobre vuestros servicios.' };
      function withValue(key, value) { var copy = {}; for (var k in valid) copy[k] = valid[k]; copy[key] = value; return copy; }

      check('El formulario tiene nombre, email, asunto y mensaje', function () {
        var missing = names.filter(function (n) { return !el(n); });
        return yesNo(missing.length === 0, 'Los 4 campos existen.', 'Faltan campos: ' + missing.join(', '));
      });
      check('Enviar el formulario vacío muestra errores', function () {
        fill({}); submit(form);
        var bad = names.filter(invalid);
        return { ok: bad.length >= 3, detail: bad.length + ' campo(s) marcados como inválidos al enviar vacío.' };
      });
      check('Rechaza un email con formato inválido («ana@correo»)', function () {
        fill(withValue('email', 'ana@correo')); submit(form);
        return yesNo(invalid('email'), 'El email se marca como inválido.', 'El email inválido se acepta como correcto.');
      });
      check('Rechaza un mensaje demasiado corto («Hola»)', function () {
        fill(withValue('message', 'Hola')); submit(form);
        return yesNo(invalid('message'), 'El mensaje corto se rechaza.', 'El mensaje corto se acepta.');
      });
      check('Un envío válido confirma y limpia el formulario', function () {
        fill(valid); submit(form);
        var status = $('[role="status"]');
        var text = status ? status.textContent.trim() : '';
        var cleared = !!el('name') && el('name').value === '';
        return { ok: !!text && cleared, detail: !text ? 'No aparece ningún mensaje de confirmación.' : cleared ? 'Confirmación mostrada: «' + text + '»' : 'Muestra la confirmación pero no limpia el formulario.' };
      });
    },

    login: function () {
      var form = $('#login-form');
      var error = $('#login-error');
      var welcome = $('#welcome');
      var logout = $('#logout');
      function reset() { if (logout && welcome && !welcome.hidden) logout.click(); form.reset(); }
      function login(email, password) { reset(); form.elements.email.value = email; form.elements.password.value = password; submit(form); }
      function loggedIn() { return !!welcome && !welcome.hidden; }

      check('Tiene campos de email y contraseña', function () {
        return yesNo(!!form && !!form.elements.email && !!form.elements.password, 'Campos presentes.', 'Faltan campos en el formulario.');
      });
      check('Enviar vacío muestra un error', function () {
        login('', '');
        return yesNo(shown(error) && error.textContent.trim() !== '', 'Error: «' + error.textContent + '»', 'No se muestra ningún error.');
      });
      check('Rechaza una contraseña incorrecta', function () {
        login('demo@agentflow.dev', 'incorrecta');
        return yesNo(!loggedIn() && shown(error), 'Acceso denegado: «' + error.textContent + '»', 'Ha iniciado sesión con una contraseña incorrecta.');
      });
      check('El error no revela si el usuario existe', function () {
        login('nadie@ejemplo.com', 'x123');
        var unknownUser = error.textContent;
        login('demo@agentflow.dev', 'incorrecta');
        var wrongPassword = error.textContent;
        return yesNo(!!unknownUser && unknownUser === wrongPassword, 'Mismo mensaje en ambos casos.', 'Mensajes distintos: «' + unknownUser + '» / «' + wrongPassword + '»');
      });
      check('Inicia sesión con las credenciales correctas', function () {
        login('demo@agentflow.dev', 'Demo1234!');
        return yesNo(loggedIn(), 'Se muestra la bienvenida.', 'No se inicia la sesión.');
      });
      check('Guarda la sesión con caducidad', function () {
        var session = typeof window.getSession === 'function' ? window.getSession() : null;
        return yesNo(!!session && session.expiresAt > Date.now(), 'Sesión guardada con caducidad.', 'No se guarda ninguna sesión.');
      });
      check('Cerrar sesión vuelve al formulario', function () {
        if (logout) logout.click();
        return yesNo(!form.hidden && !loggedIn(), 'Vuelve al formulario.', 'La sesión sigue abierta.');
      });
    },

    api: function () {
      function call(method, path, body) { return handleRequest(method, path, body); }
      check('GET /api/products responde 200 con productos', function () {
        var r = call('GET', '/api/products', '');
        return { ok: !!r && r.status === 200 && Array.isArray(r.body) && r.body.length >= 3, detail: r ? 'Estado ' + r.status + (Array.isArray(r.body) ? ', ' + r.body.length + ' productos' : '') : 'Sin respuesta.' };
      });
      var created = null;
      check('POST válido crea el producto con 201', function () {
        var r = call('POST', '/api/products', '{"name": "Producto de prueba", "price": 5}');
        created = r && r.body;
        return { ok: !!r && r.status === 201 && !!created && !!created.id, detail: r ? 'Estado ' + r.status : 'Sin respuesta.' };
      });
      check('El producto creado aparece en el listado', function () {
        var r = call('GET', '/api/products', '');
        var found = !!r && Array.isArray(r.body) && r.body.some(function (p) { return p.name === 'Producto de prueba'; });
        return yesNo(found, 'Aparece en GET /api/products.', 'No aparece en el listado.');
      });
      check('POST inválido responde 400 con los errores', function () {
        var r = call('POST', '/api/products', '{"name": "", "price": -1}');
        return { ok: !!r && r.status === 400 && !!r.body && Array.isArray(r.body.errors), detail: r ? 'Estado ' + r.status : 'Sin respuesta.' };
      });
      check('Un cuerpo JSON mal formado responde 400', function () {
        var r;
        try { r = call('POST', '/api/products', '{mal formado'); } catch (e) { return { ok: false, detail: 'La API lanza una excepción: ' + e.message }; }
        return { ok: !!r && r.status === 400, detail: r ? 'Estado ' + r.status : 'Sin respuesta.' };
      });
      check('Una ruta desconocida responde 404', function () {
        var r = call('GET', '/api/orders', '');
        return { ok: !!r && r.status === 404, detail: r ? 'Estado ' + r.status : 'Sin respuesta.' };
      });
      check('La consola de la página muestra la respuesta', function () {
        var form = $('#request-form');
        form.elements.method.value = 'GET'; form.elements.path.value = '/api/products'; form.elements.body.value = '';
        submit(form);
        var status = $('#response-status').textContent;
        return yesNo(status === '200', 'La consola muestra «200».', 'La consola muestra «' + status + '».');
      });
    },

    calculator: function () {
      var form = $('#calc-form');
      check('Calcula la propina y el reparto (50 €, 10 %, 2 personas)', function () {
        var r = calculateTip(50, 10, 2);
        return { ok: r.ok && r.tip === 5 && r.perPerson === 27.5, detail: 'Propina ' + r.tip + ', por persona ' + r.perPerson };
      });
      check('Redondea a céntimos (10 €, 15 %, 3 personas → 3,83 €)', function () {
        var r = calculateTip(10, 15, 3);
        return { ok: r.perPerson === 3.83, detail: 'Por persona: ' + r.perPerson };
      });
      check('Rechaza 0 personas', function () {
        var r = calculateTip(50, 10, 0);
        return { ok: r.ok === false, detail: r.ok === false ? 'Error: «' + r.error + '»' : 'Devuelve ' + r.perPerson + ' por persona.' };
      });
      check('La interfaz muestra el total por persona (100 €, 20 %, 4)', function () {
        form.elements.bill.value = '100';
        var tip = form.querySelector('input[name="tip"][value="20"]'); if (tip) tip.checked = true;
        form.elements.people.value = '4';
        fire(form.elements.bill, 'input');
        var text = $('#total-per-person').textContent;
        return { ok: /30,00/.test(text), detail: 'Muestra «' + text + '»' };
      });
      check('Muestra un error con un importe no válido', function () {
        form.elements.bill.value = '-5';
        fire(form.elements.bill, 'input');
        var error = $('#calc-error');
        return yesNo(shown(error) && error.textContent.trim() !== '', 'Error: «' + error.textContent + '»', 'No se muestra ningún error.');
      });
      check('Reiniciar limpia el formulario y los resultados', function () {
        $('#reset-button').click();
        var text = $('#total-per-person').textContent;
        return yesNo(form.elements.bill.value === '' && /0,00/.test(text), 'Formulario y resultados reiniciados.', 'No se reinicia (importe «' + form.elements.bill.value + '», resultado «' + text + '»).');
      });
    },

    dashboard: function () {
      function rows() { return all('#sales-table tbody tr'); }
      function euros(text) { return parseFloat(text.replace(/[^\d,]/g, '').replace(',', '.')); }
      check('La tabla muestra todas las ventas', function () {
        return { ok: rows().length === SALES.length, detail: rows().length + ' de ' + SALES.length + ' filas.' };
      });
      check('Los ingresos totales coinciden con los datos', function () {
        var sum = SALES.reduce(function (acc, r) { return acc + r.revenue; }, 0);
        var text = $('#kpi-revenue').textContent;
        return { ok: text === formatEuro(sum) && text !== '—', detail: 'Indicador: «' + text + '»' };
      });
      check('Los importes usan formato de euro español', function () {
        var text = $('#kpi-revenue').textContent;
        return { ok: /\d,\d{2}\s?€/.test(text), detail: 'Indicador: «' + text + '»' };
      });
      check('Filtrar por «Norte» deja solo esas filas', function () {
        var input = $('#filter');
        input.value = 'Norte'; fire(input, 'input');
        var visible = rows();
        var ok = visible.length > 0 && visible.length < SALES.length && visible.every(function (tr) { return tr.textContent.indexOf('Norte') !== -1; });
        var count = visible.length;
        input.value = ''; fire(input, 'input');
        return { ok: ok, detail: count + ' fila(s) tras filtrar.' };
      });
      check('Ordena por ingresos al pulsar la cabecera', function () {
        $('th[data-key="revenue"]').click();
        var values = rows().map(function (tr) { return euros(tr.lastElementChild.textContent); });
        var sorted = values.every(function (v, i) { return i === 0 || values[i - 1] <= v; });
        return { ok: sorted && values.length > 1, detail: sorted ? 'Orden ascendente correcto.' : 'Orden: ' + values.join(', ') };
      });
      check('El gráfico tiene una barra por región', function () {
        var regions = SALES.map(function (r) { return r.region; }).filter(function (r, i, a) { return a.indexOf(r) === i; });
        var bars = all('#chart .bar').length;
        return { ok: bars === regions.length, detail: bars + ' barra(s) para ' + regions.length + ' regiones.' };
      });
    },

    landing: function () {
      check('La navegación enlaza con secciones que existen', function () {
        var links = all('a[href^="#"]').filter(function (a) { return a.getAttribute('href').length > 1; });
        var broken = links.filter(function (a) { return !document.getElementById(a.getAttribute('href').slice(1)); });
        return { ok: links.length >= 3 && broken.length === 0, detail: links.length + ' enlaces, ' + broken.length + ' rotos.' };
      });
      check('Muestra los servicios', function () {
        var n = all('#offers .offer').length;
        return { ok: n >= 3, detail: n + ' servicio(s) visibles.' };
      });
      check('Muestra el horario de los 7 días', function () {
        var n = all('#hours tbody tr').length;
        return { ok: n === 7, detail: n + ' fila(s) de horario.' };
      });
      check('Calcula bien si está abierto (lunes 10:00 sí; lunes 23:30 y domingo no)', function () {
        var monday10 = new Date(2026, 0, 5, 10, 0);
        var monday2330 = new Date(2026, 0, 5, 23, 30);
        var sunday = new Date(2026, 0, 4, 12, 0);
        var got = [isOpenAt(monday10), isOpenAt(monday2330), isOpenAt(sunday)];
        return { ok: got[0] === true && got[1] === false && got[2] === false, detail: 'Resultados: ' + got.join(', ') };
      });
      check('Indica si está abierto ahora', function () {
        var text = $('#open-badge').textContent.trim();
        return yesNo(text !== '', 'Indicador: «' + text + '»', 'No hay indicador de apertura.');
      });
      check('El botón de menú abre la navegación móvil', function () {
        var button = $('.menu-button');
        button.click();
        var open = button.getAttribute('aria-expanded') === 'true';
        button.click();
        return yesNo(open, 'aria-expanded pasa a «true».', 'El botón no abre el menú.');
      });
    },

    list: function () {
      function items() { return all('#items li'); }
      function find(title) { return items().filter(function (li) { return li.querySelector('span') && li.querySelector('span').textContent === title; })[0]; }
      var form = $('#add-form');
      var input = $('#new-item');
      check('Muestra los elementos iniciales', function () {
        return { ok: items().length > 0, detail: items().length + ' elemento(s).' };
      });
      check('Añade un elemento nuevo', function () {
        input.value = 'Elemento de prueba'; submit(form);
        return yesNo(!!find('Elemento de prueba'), 'Aparece en la lista.', 'No aparece en la lista.');
      });
      check('Ignora los elementos vacíos', function () {
        var before = items().length;
        input.value = '   '; submit(form);
        return { ok: items().length === before, detail: before + ' → ' + items().length + ' elementos.' };
      });
      check('Marca un elemento como completado', function () {
        find('Elemento de prueba').querySelector('input').click();
        var li = find('Elemento de prueba');
        return yesNo(!!li && li.classList.contains('done'), 'Se marca como completado.', 'No cambia de estado.');
      });
      check('El filtro «Pendientes» oculta los completados', function () {
        $('[data-filter="pending"]').click();
        var hidden = !find('Elemento de prueba') && items().every(function (li) { return !li.classList.contains('done'); });
        $('[data-filter="all"]').click();
        return yesNo(hidden, 'Solo se ven los pendientes.', 'Siguen viéndose elementos completados.');
      });
      check('Elimina un elemento', function () {
        find('Elemento de prueba').querySelector('.remove').click();
        return yesNo(!find('Elemento de prueba'), 'Se elimina de la lista.', 'Sigue en la lista.');
      });
      check('Muestra un estado vacío', function () {
        items().forEach(function () { var li = items()[0]; if (li) li.querySelector('.remove').click(); });
        return yesNo(items().length === 0 && shown($('#empty')), 'Se muestra «No hay elementos».', 'No aparece el estado vacío.');
      });
    },

    smoke: function () {
      check('La página tiene contenido visible', function () {
        var text = (document.body.textContent || '').trim();
        return { ok: text.length > 20, detail: text.length + ' caracteres de texto.' };
      });
      check('Tiene un título principal (h1)', function () {
        var h1 = $('h1');
        return yesNo(!!h1, 'Título: «' + (h1 ? h1.textContent.trim() : '') + '»', 'No hay ningún h1.');
      });
      check('Tiene elementos interactivos', function () {
        var n = all('a, button, input, select, textarea').length;
        return { ok: n > 0, detail: n + ' elemento(s) interactivos.' };
      });
    }
  };

  function run() {
    var app = document.body ? document.body.getAttribute('data-agentflow-app') : null;
    var name = app && SUITES[app] ? app : 'smoke';
    try { SUITES[name](); } catch (e) { results.push({ name: 'Ejecución de las pruebas', passed: false, detail: String(e && e.message ? e.message : e) }); }
    var errors = window.__previewErrors || [];
    results.push({ name: 'Sin errores de JavaScript al cargar', passed: errors.length === 0, detail: errors.length ? errors.slice(0, 2).join(' · ') : 'Ningún error registrado.' });
    parent.postMessage({ source: '${PREVIEW_MESSAGE_SOURCE}', type: 'tests', suite: name, results: results }, '*');
  }
  if (document.readyState === 'complete') setTimeout(run, 0);
  else window.addEventListener('load', function () { setTimeout(run, 0); });
})();
`;

export function isPreviewTestMessage(data: unknown): data is PreviewTestMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { source?: unknown }).source === PREVIEW_MESSAGE_SOURCE &&
    (data as { type?: unknown }).type === 'tests' &&
    Array.isArray((data as { results?: unknown }).results)
  );
}
