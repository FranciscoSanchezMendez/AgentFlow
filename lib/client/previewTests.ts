/**
 * Pruebas de interacción que se ejecutan DENTRO de la vista previa, en un iframe
 * oculto con `sandbox="allow-scripts"` (origen opaco: sin acceso a la app, a sus
 * cookies ni a la red, por la CSP del documento). Rellenan el formulario,
 * disparan el envío y comprueban el resultado en el DOM; los resultados se
 * envían a la app con `postMessage`.
 *
 * Están pensadas para formularios de contacto (campos name, email, subject y
 * message). Si la página no tiene formulario, lo indican y no ejecutan nada.
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
  results: PreviewTestResult[];
  note?: string;
}

export const PREVIEW_TEST_SCRIPT = String.raw`
(function () {
  function send(payload) {
    payload.source = '${PREVIEW_MESSAGE_SOURCE}';
    payload.type = 'tests';
    parent.postMessage(payload, '*');
  }
  function run() {
    var results = [];
    function check(name, fn) {
      try {
        var r = fn();
        results.push({ name: name, passed: !!r.ok, detail: r.detail });
      } catch (e) {
        results.push({ name: name, passed: false, detail: 'Error al ejecutar la prueba: ' + (e && e.message ? e.message : e) });
      }
    }
    var form = document.querySelector('form');
    if (!form) { send({ results: [], note: 'La página no contiene ningún formulario que probar.' }); return; }
    var names = ['name', 'email', 'subject', 'message'];
    function el(n) { return form.elements[n] || null; }
    function fill(values) { names.forEach(function (n) { if (el(n)) el(n).value = values[n] || ''; }); }
    function submit() { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
    function invalid(n) { return !!el(n) && el(n).getAttribute('aria-invalid') === 'true'; }
    var valid = {
      name: 'Ana García',
      email: 'ana@example.com',
      subject: 'Presupuesto',
      message: 'Me gustaría recibir información sobre vuestros servicios.'
    };
    function withValue(key, value) { var copy = {}; for (var k in valid) copy[k] = valid[k]; copy[key] = value; return copy; }

    check('El formulario tiene nombre, email, asunto y mensaje', function () {
      var missing = names.filter(function (n) { return !el(n); });
      return { ok: missing.length === 0, detail: missing.length ? 'Faltan campos: ' + missing.join(', ') : 'Los 4 campos existen.' };
    });
    check('Enviar el formulario vacío muestra errores', function () {
      fill({}); submit();
      var bad = names.filter(invalid);
      return { ok: bad.length >= 3, detail: bad.length + ' campo(s) marcados como inválidos al enviar vacío.' };
    });
    check('Rechaza un email con formato inválido («ana@correo»)', function () {
      fill(withValue('email', 'ana@correo')); submit();
      return { ok: invalid('email'), detail: invalid('email') ? 'El email se marca como inválido.' : 'El email inválido se acepta como correcto.' };
    });
    check('Rechaza un mensaje demasiado corto («Hola»)', function () {
      fill(withValue('message', 'Hola')); submit();
      return { ok: invalid('message'), detail: invalid('message') ? 'El mensaje corto se rechaza.' : 'El mensaje corto se acepta.' };
    });
    check('Un envío válido confirma y limpia el formulario', function () {
      fill(valid); submit();
      var status = document.querySelector('[role="status"]');
      var text = status ? status.textContent.trim() : '';
      var cleared = !!el('name') && el('name').value === '';
      return {
        ok: !!text && cleared,
        detail: !text ? 'No aparece ningún mensaje de confirmación.' : cleared ? 'Confirmación mostrada: «' + text + '»' : 'Muestra la confirmación pero no limpia el formulario.'
      };
    });
    send({ results: results });
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
