# AgentFlow

Aplicación web multiagente con **Next.js 15 + TypeScript** en la que tres agentes de IA colaboran para desarrollar software: el **Orchestrator** planifica, **Develop** escribe archivos reales en un *workspace* y **Testing** los inspecciona, devuelve los fallos a Develop y vuelve a validar hasta que todo pasa o se agota el límite de iteraciones.

El resultado no es solo un registro de actividad: en el **Workspace** del dashboard se ven los archivos generados, cada cambio con su diff, las pruebas de cada iteración y una **vista previa funcional** de la página desarrollada.

---

## Qué hace cada agente

| Agente | Responsabilidad | Qué produce |
| --- | --- | --- |
| **Orchestrator** | Recibe la petición, la descompone en tareas con criterios de aceptación (cada criterio asociado a un archivo), las asigna y redacta el informe final. | Plan, asignaciones, escalados e informe. |
| **Develop** | Escribe o corrige los archivos de cada tarea a partir del estado actual del workspace y del feedback de Testing. | Archivos completos (creados, modificados o eliminados). |
| **Testing** | Abre los archivos del workspace, comprueba cada criterio y explica por qué falla cada uno. Al final hace una validación de integración. | Resultados por criterio (aprobado/fallido + motivo + archivo) y feedback. |

## Cómo funciona el ciclo

```
Petición ─▶ Orchestrator.plan() ─▶ tareas + criterios (archivo + comprobaciones)
   por cada tarea, hasta maxIterations (1–10):
      Develop.implement(workspace, feedback) ─▶ archivos
      motor: sanea rutas, aplica límites y registra cada cambio (antes/después)
      Testing.review(workspace) ─▶ resultado por criterio
         ✓ todo pasa   → tarea completada
         ✕ algo falla  → feedback concreto a Develop → nueva iteración
         ✕ y sin iteraciones → tarea fallida + escalado al Orchestrator
   Testing: validación de integración
   Orchestrator: informe final
```

Cada paso se emite en tiempo real (stream NDJSON) y se guarda en la persistencia al empezar y al terminar.

---

## Demo de contacto

Es la petición precargada en el dashboard:

> Crear una página de contacto responsive con nombre, email, asunto y mensaje, validación de campos y confirmación al enviar

Con el límite por defecto (3 iteraciones) la ejecución hace lo siguiente:

| Tarea | Archivos | Iteraciones | Qué ocurre |
| --- | --- | --- | --- |
| T1 · Maquetar la página | `index.html`, `styles.css` (nuevos) | 1 | Pasa a la primera. |
| T2 · Validar los campos | `validation.js` (nuevo, luego modificado 2 veces) | 3 | **Fallo controlado**: la primera versión solo comprueba que el email no esté vacío y no exige longitud mínima del mensaje. Testing lo detecta (`EMAIL_PATTERN.test(` no aparece), Develop corrige el email en la iteración 2 y la longitud en la 3. |
| T3 · Envío y confirmación | `app.js` (nuevo, luego modificado), `index.html` (modificado: añade los `<script>`) | 2 | La primera versión no confirma el envío. Testing lo reporta y Develop lo corrige. |
| Validación de integración | — | 1 | Comprueba que todas las tareas están aprobadas y que el workspace contiene los archivos. |

Resultado final: 4 archivos, 8 cambios, 6 iteraciones de desarrollo y una página de contacto que funciona en la vista previa. Con límite 2 la tarea T2 falla y el run termina "con fallos"; con límite 1 fallan T2 y T3.

---

## Cómo se visualizan los artefactos (Workspace)

La sección **Workspace** del dashboard tiene:

- **Selector de versión**: cada paso es "tarea + iteración", con el veredicto de Testing (✓/✕). Todo el workspace (archivos, cambios, vista previa) se muestra tal como estaba en ese paso.
- **Vista previa**: la página generada funcionando, con modo escritorio/móvil. Al lado, **pruebas de interacción** que se ejecutan en tu navegador sobre esa versión: rellenan el formulario, lo envían y comprueban errores y confirmación. En el paso 5 (T3, iteración 1) reproducen el mismo fallo que reportó Testing (4/5); en la versión final pasan 5/5.
- **Archivos**: árbol del proyecto, contenido con números de línea, estado (nuevo/modificado) y qué tarea e iteración lo cambió por última vez.
- **Cambios**: historial de creaciones, modificaciones y eliminaciones con un diff línea a línea (los archivos nuevos se muestran enteros como añadidos y los tramos largos sin cambios se pliegan).
- **Pruebas**: resultados de Testing por tarea e iteración, con el motivo de cada fallo y enlace al archivo inspeccionado.

Desde el **tablero de tareas**, cada tarea muestra sus archivos; al pulsar uno se abre en el Workspace.

---

## Qué se simula en modo demo y qué es real

El modo demo es el predeterminado: no usa API keys, no tiene coste y es determinista (mismos resultados en cada ejecución).

**Se simula** (no hay un modelo de IA tomando decisiones):

- El plan del Orchestrator sale de una plantilla elegida por palabras clave (contacto/formulario, autenticación, API o genérica).
- El código que escribe Develop sale de plantillas del catálogo (`lib/agents/demo/catalog.ts`), y sus "olvidos" del primer intento están predefinidos para mostrar el ciclo de corrección.

**Es real**:

- Los archivos existen en el workspace de la ejecución, con su historial de cambios y diffs, y se persisten.
- Develop solo corrige lo que Testing le reporta: lee el feedback y vuelve a generar los archivos a partir del workspace actual, conservando el trabajo de otras tareas.
- Testing inspecciona el contenido de los archivos. Si un criterio no se cumple, la prueba falla con el archivo y los fragmentos que faltan, y ese resultado decide si la tarea pasa.
- La vista previa ejecuta el HTML/CSS/JS generado y las pruebas de interacción lo usan de verdad (en un iframe aislado del navegador).
- Los tests automatizados ejecutan `validation.js` generado y comprueban que la versión final valida bien y que la primera versión tenía el fallo (`tests/contactArtifacts.test.ts`).

**Qué valida Testing en el servidor:** comprobaciones estáticas sobre el contenido de los archivos (presencia de las estructuras exigidas por cada criterio). En modo LLM, si los criterios no traen comprobaciones concretas, la revisión la hace el modelo leyendo los archivos. El código generado **no se ejecuta nunca en el servidor**.

---

## Seguridad y aislamiento

- **Workspace virtual**: los archivos viven en memoria y en la base de datos como texto. Nunca se escriben en el disco del servidor ni se ejecutan allí. Una petición de usuario no puede leer, escribir ni ejecutar nada en el sistema operativo.
- **Rutas saneadas**: se rechazan rutas absolutas, unidades de Windows, `..`, segmentos vacíos y caracteres fuera de `[A-Za-z0-9_.-/]`, con aviso en los logs. Límites: 40 archivos, 200 KB por archivo y rutas de 120 caracteres como máximo.
- **Vista previa aislada**: el documento se genera incrustando solo archivos del workspace (se eliminan los recursos externos) y se muestra en un `iframe` con `sandbox="allow-scripts allow-forms"`, **sin `allow-same-origin`**. Su origen es opaco: no puede acceder a la app, a sus cookies ni a su almacenamiento. Además, la CSP del documento (`default-src 'none'`, `form-action 'none'`, sin `connect-src`) bloquea cualquier petición de red.
- **Pruebas de interacción**: se ejecutan en otro iframe oculto con `sandbox="allow-scripts"`. La app solo acepta mensajes que vengan de ese iframe y con el formato esperado.
- **Secretos**: las claves solo existen como variables de servidor sin `NEXT_PUBLIC_`. `/api/health` no las expone (cubierto por un test). `.env*` está excluido de Git.
- **Otras medidas**: validación de entrada, *rate limiting* por IP (10 ejecuciones/minuto), cabeceras de seguridad y RLS en Supabase sin políticas públicas.

---

## Arquitectura

```
app/
  page.tsx                   → Dashboard
  api/runs/route.ts          → POST: ejecuta (stream NDJSON) · GET: historial
  api/runs/[id]/route.ts     → GET: ejecución completa (con cambios de archivos)
  api/health/route.ts        → modo, proveedor y persistencia (sin secretos)
components/
  Workspace.tsx              → vista previa, archivos, cambios, pruebas, versión
  TaskBoard, AgentCards, Conversation, ActivityLog, HistoryPanel, Dashboard
lib/
  engine/workflow.ts         → motor del ciclo (aplica artefactos al workspace)
  workspace.ts               → saneado de rutas, reconstrucción por versión, documento de preview
  diff.ts                    → diff de líneas (LCS) y plegado
  agents/provider.ts         → interfaz AgentProvider + verificación estática por archivo
  agents/demo/               → catálogo de plantillas y proveedor demo
  agents/anthropicProvider.ts→ proveedor con modelos reales (Claude)
  persistence/               → Supabase o memoria
  client/runState.ts         → reductor de eventos de la UI
  client/previewTests.ts     → pruebas de interacción de la vista previa
tests/                       → Vitest
supabase-schema.sql          → esquema con RLS
```

El motor solo depende de la interfaz `AgentProvider` (`plan`, `implement`, `review`). Develop devuelve `{ files: [{ path, content }], deleted?: string[], notes }`; el motor decide qué se aplica.

---

## Instalación y ejecución local

Requisitos: **Node.js 22 LTS** (fijado en `package.json`; Node 20.9+ también funciona en local con un aviso de npm) y npm 10+.

```bash
npm install
cp .env.example .env.local   # opcional: sin rellenar nada funciona en modo demo
npm run dev                  # http://localhost:3000
```

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción (incluye comprobación de tipos) |
| `npm start` | Sirve la compilación de producción |
| `npm test` | Tests (Vitest) |
| `npm run typecheck` | Comprobación de tipos |

## Configurar modelos reales

1. Consigue una API key en [platform.claude.com](https://platform.claude.com).
2. En `.env.local` (o en las variables de Vercel):
   ```
   AGENTFLOW_MODE=llm
   ANTHROPIC_API_KEY=tu-clave
   AGENTFLOW_MODEL=claude-opus-5-5   # opcional
   ```
3. Reinicia la app. La cabecera mostrará "Modo LLM".

En modo LLM cada agente es una llamada a Claude con su propio prompt de sistema y salida JSON validada con un esquema:

- El Orchestrator planifica tareas con criterios asociados a archivos. Para interfaces web pide una página estática (`index.html`, `styles.css`, `.js`) para que la vista previa funcione.
- Develop devuelve los archivos completos.
- Testing revisa el workspace criterio a criterio.

Si el modelo rechaza una petición, se reintenta automáticamente con un modelo de respaldo. Cada ejecución hace varias llamadas a la API y tiene coste. Si falta la clave, la app vuelve al modo demo.

Para usar otro proveedor, implementa `AgentProvider` y regístralo en `lib/agents/factory.ts`.

## Variables de entorno

Todas son solo de servidor.

| Variable | Descripción |
| --- | --- |
| `AGENTFLOW_MODE` | `demo` (por defecto) o `llm` |
| `ANTHROPIC_API_KEY` | Necesaria para `llm` |
| `AGENTFLOW_MODEL` | Modelo de Claude (por defecto `claude-opus-5-5`) |
| `AGENTFLOW_DEMO_DELAY_MS` | Pausa visual entre pasos en demo (0–5000, por defecto 400) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Persistencia en Supabase (opcional) |

## Persistencia (Supabase)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, ejecuta `supabase-schema.sql`. Es idempotente: si ya tenías la versión anterior del esquema, añade la tabla `file_changes` y la columna `tasks.files` sin perder datos.
3. Copia la URL y la *service role key* (**Project Settings → API**) a `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.

Tablas: `runs`, `tasks`, `agent_messages`, `agent_logs`, `iterations` (resultados de cada prueba) y `file_changes` (contenido antes/después de cada cambio, en orden). El workspace de cualquier versión se reconstruye a partir de `file_changes`.

Sin Supabase, el historial se guarda en memoria del servidor: un máximo de 50 ejecuciones, que se pierden al reiniciar. En Vercel cada instancia tiene su propia memoria.

## Despliegue en Vercel

1. Sube el repositorio a GitHub, sin `.env.local`.
2. En Vercel: **Add New → Project** e importa el repositorio. Next.js se detecta solo y se usa Node 22 por `engines`.
3. Opcional: en **Settings → Environment Variables** añade las variables de Supabase y, para modelos reales, `AGENTFLOW_MODE=llm` y `ANTHROPIC_API_KEY`.
4. Despliega y comprueba `https://<tu-app>.vercel.app/api/health`.

La compilación no descarga recursos externos (se usan fuentes del sistema). `POST /api/runs` declara `maxDuration = 300` s; el límite real depende del plan de Vercel.

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/runs` | `{ "prompt": string (5–2000), "maxIterations"?: 1–10 }` → `application/x-ndjson` |
| `GET` | `/api/runs` | Últimas 30 ejecuciones |
| `GET` | `/api/runs/:id` | Ejecución completa: tareas, mensajes, logs, iteraciones y cambios de archivos |
| `GET` | `/api/health` | Modo, proveedor, persistencia y límites |

Eventos del stream: `run_started`, `agent_status`, `task_created`, `task_updated`, `file_changed`, `message`, `log`, `iteration`, `error`, `run_finished`.

## Tests

```bash
npm test
```

Cubren:

- **Motor**: ciclo completo, archivos por tarea, creaciones y modificaciones con su versión anterior, feedback y corrección, límite de iteraciones, errores, cancelación, rutas peligrosas rechazadas, eliminaciones y archivos sin cambios.
- **Catálogo demo**: cada criterio es satisfacible y, si se omite, falla solo él.
- **Artefactos de contacto**: la `validation.js` final valida bien y la primera tiene el fallo; el JS es sintácticamente válido; la página de preview está completa.
- **Workspace**: saneado de rutas, reconstrucción por versión y documento de preview (CSP, recursos externos eliminados, escape de `</script>`).
- **Diff**, **validación**, **rate limiting**, **reductor de UI**, **NDJSON**, **persistencia en memoria**, **streaming** y **rutas de la API**.

Las pruebas de interacción de la vista previa se ejecutan en el navegador y no forman parte de Vitest (no hay DOM de navegador en los tests). El modo LLM y Supabase no se prueban contra servicios reales, porque requieren credenciales y tienen coste.

## Limitaciones conocidas

- La demo tiene plantillas para cuatro tipos de petición. Solo la de contacto genera una página con vista previa; las de API, autenticación y genérica generan archivos de código sin vista previa.
- Las pruebas de interacción de la vista previa están pensadas para formularios de contacto (campos `name`, `email`, `subject`, `message`).
- La demo no incluye ninguna eliminación de archivos. El motor y la UI las soportan y están cubiertas por tests.
- El rate limiting y el historial en memoria son por instancia. Para flujos LLM largos convendría una cola de trabajos.

## Herramientas de IA utilizadas

Proyecto desarrollado con la ayuda de **Claude Code** (Anthropic), que se usó para inspeccionar el código, implementar la arquitectura y el workspace, escribir y ejecutar los tests y la compilación, y verificar la aplicación en el navegador en escritorio y móvil.
