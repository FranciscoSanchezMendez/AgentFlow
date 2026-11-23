/**
 * Piezas comunes de las páginas que genera Develop en modo demo.
 */

/** Hoja de estilos base + estilos propios + marcador del criterio responsive. */
export function pageCss(accent: string, responsiveId: string, extra: string): string {
  return `:root {
  --bg: #f4f5fa;
  --card: #ffffff;
  --text: #1c2033;
  --muted: #5d6479;
  --line: #dfe2ec;
  --accent: ${accent};
  --danger: #d93b3b;
  --ok: #138a56;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.5;
}

.page { width: 100%; max-width: 960px; margin: 0 auto; padding: 32px 20px; }
.card { background: var(--card); border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(28, 32, 51, 0.08); }
.eyebrow { margin: 0; color: var(--accent); font-weight: 700; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
h1 { margin: 6px 0 8px; font-size: 30px; line-height: 1.2; }
h2 { margin: 0 0 12px; font-size: 20px; }
.lead { margin: 0 0 24px; color: var(--muted); }
label { font-weight: 600; font-size: 14px; }
input, select, textarea {
  font: inherit;
  padding: 10px 12px;
  border: 1px solid #cfd3e1;
  border-radius: 10px;
  background: #fbfbfe;
  color: var(--text);
}
input:focus, select:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
button {
  font: inherit;
  font-weight: 700;
  border: 0;
  border-radius: 10px;
  padding: 10px 18px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}
button.secondary { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
.alert { margin: 0; padding: 10px 12px; border-radius: 10px; background: #fdecec; color: var(--danger); font-weight: 600; }
.success { margin: 0; padding: 10px 12px; border-radius: 10px; background: #e8f7ef; color: var(--ok); font-weight: 600; }
.muted { color: var(--muted); font-size: 14px; }
[hidden] { display: none !important; }
${extra}
@@${responsiveId}@@
`;
}

export function pageHtml(options: { title: string; app: string; body: string; scriptsMarker: string }): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${options.title}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body data-agentflow-app="${options.app}">
${options.body}
  @@${options.scriptsMarker}@@
</body>
</html>
`;
}
