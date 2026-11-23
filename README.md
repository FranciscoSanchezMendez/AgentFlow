# AgentFlow

Aplicación web multiagente construida con **Next.js 15 + TypeScript** en la que tres agentes de IA colaboran para llevar una petición de desarrollo desde la idea hasta la validación:

| Agente | Rol |
| --- | --- |
| **Orchestrator** | Recibe la petición, la descompone en tareas con criterios de aceptación, las asigna y redacta el informe final. |
| **Develop** | Implementa el código de cada tarea y lo corrige a partir del feedback de Testing. |
| **Testing** | Verifica cada entrega contra sus criterios, devuelve feedback concreto a Develop y ejecuta la validación de integración final. |

El ciclo **Develop ⇄ Testing** se repite por tarea hasta que todas las pruebas pasan o se alcanza el **límite máximo de iteraciones** configurable (1–10).

---

## Funcionalidades

- **Dashboard responsive** (escritorio, tablet y móvil) con tema oscuro.
- **Tarjetas de agente** con estado en tiempo real (inactivo, pensando, trabajando, esperando, terminado, error), actividad actual y métricas.
- **Tablero de tareas** con estados `pending → in_progress → in_review → changes_requested → completed / failed`, iteración actual, historial de iteraciones (✓/✕), criterios de aceptación y el código entregado.
- **Mensajes entre agentes**: plan, asignaciones, implementaciones, feedback, aprobaciones, escalados e informe.
- **Logs de actividad** con niveles (INFO, OK, AVISO, ERROR) y filtro por agente.
- **Ejecución en streaming** (NDJSON): la interfaz se actualiza paso a paso y se puede detener.
- **Historial de ejecuciones**: listado y apertura del detalle completo de cualquier ejecución anterior.
- **Persistencia en Supabase** (Postgres) con respaldo automático en memoria si no está configurado.
- **Modo demo** sin API keys ni coste (predeterminado).
- **Modo LLM** con modelos reales de Claude (Anthropic) mediante una arquitectura de proveedores intercambiables.

---

## Arquitectura

```
app/
  page.tsx                 → Dashboard (cliente)
  api/runs/route.ts        → POST: inicia ejecución (stream NDJSON) · GET: historial
  api/runs/[id]/route.ts   → GET: detalle de una ejecución
  api/health/route.ts      → GET: modo, proveedor y persistencia activos (sin secretos)
  api/run/route.ts         → alias de compatibilidad del MVP inicial (POST)
components/                → AgentCards, TaskBoard, Conversation, ActivityLog, HistoryPanel…
lib/
  types.ts                 → modelo de dominio (Run, Task, AgentMessage, LogEntry, Iteration, eventos)
  engine/workflow.ts       → motor del flujo multiagente (independiente del proveedor)
  agents/provider.ts       → interfaz AgentProvider + verificación estática
  agents/demo/             → proveedor demo determinista y su catálogo de plantillas
  agents/anthropicProvider.ts → proveedor con modelos reales (Claude)
  agents/factory.ts        → elige proveedor según el entorno
  persistence/             → RunRepository: Supabase o memoria
  server/                  → servicio de streaming y contexto del servidor
  client/runState.ts       → reductor puro de eventos → estado de la UI
  validation.ts · rateLimit.ts · config.ts
tests/                     → tests automatizados (Vitest)
supabase-schema.sql        → esquema de base de datos con RLS
```

### Flujo

```
Usuario ─▶ POST /api/runs ─▶ runWorkflow()
   Orchestrator.plan()            → tareas + criterios
   por cada tarea (hasta maxIterations):
      Develop.implement()         → código
      Testing.review()            → resultados por criterio
         ✓ todos pasan  → tarea completada
         ✕ alguno falla → feedback a Develop (o tarea fallida si se agotó el límite)
   Testing: validación de integración
   Orchestrator: informe final
Cada paso emite un evento → stream NDJSON → reductor de la UI
Al empezar y al terminar → RunRepository.saveRun()
```

### Integrar otros modelos

El motor solo conoce la interfaz `AgentProvider` (`plan`, `implement`, `review`). Para añadir otro proveedor (OpenAI, un modelo local, etc.) basta con implementarla y registrarla en `lib/agents/factory.ts`. El proveedor incluido para modelos reales es `AnthropicProvider`, que usa el SDK oficial `@anthropic-ai/sdk`, salidas estructuradas (JSON Schema) para que cada agente devuelva datos validables y el *fallback* del servidor ante rechazos (`fallbacks: 'default'`).

### Sobre el modo demo

El modo demo **no llama a ninguna API**. Es determinista (los tests son reproducibles), pero el ciclo es real:

- El Orchestrator elige una plantilla según palabras clave (formulario, API, autenticación o genérica).
- Develop genera código y en el primer intento "olvida" algunos criterios a propósito.
- Testing **comprueba realmente** el código generado buscando lo que exige cada criterio; si falta algo, la prueba falla y envía feedback con el id del criterio.
- Develop corrige un punto de feedback por iteración.

Con el límite por defecto (3) el ejemplo del formulario termina con 3/3 tareas en 6 iteraciones; con límite 2 o 1 se ve cómo las tareas fallan al agotar las iteraciones.

> El código generado en modo demo es ilustrativo: no se escribe en disco ni se ejecuta.

---

## Requisitos

- **Node.js 22 LTS** (fijado en `package.json` con `"engines": { "node": "22.x" }`, que es la versión que usará Vercel). Node 20.9+ también funciona en local, con un aviso de npm.
- npm 10+.
- Opcional: un proyecto de Supabase y una API key de Anthropic.

## Instalación y ejecución local

```bash
npm install
cp .env.example .env.local   # opcional: la app funciona sin rellenar nada (modo demo)
npm run dev                  # http://localhost:3000
```

Scripts disponibles:

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción (incluye comprobación de tipos) |
| `npm start` | Sirve la compilación de producción |
| `npm test` | Ejecuta los tests (Vitest) |
| `npm run typecheck` | Comprobación de tipos con `tsc` |

## Variables de entorno

Todas son **solo de servidor** (ninguna usa el prefijo `NEXT_PUBLIC_`).

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `AGENTFLOW_MODE` | No | `demo` (por defecto) o `llm`. |
| `ANTHROPIC_API_KEY` | Solo para `llm` | Sin ella, la app usa el modo demo aunque se pida `llm`. |
| `AGENTFLOW_MODEL` | No | Modelo de Claude. Por defecto `claude-opus-5-5`. |
| `AGENTFLOW_DEMO_DELAY_MS` | No | Pausa visual entre pasos del modo demo (0–5000, por defecto 400). |
| `SUPABASE_URL` | No | URL del proyecto de Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service role key de Supabase (solo servidor). |

## Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor** y ejecuta el contenido de `supabase-schema.sql` (es idempotente).
3. En **Project Settings → API** copia la URL y la *service role key* a `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
4. Reinicia la app: la etiqueta de la cabecera pasará de "Memoria local" a "Supabase".

Tablas: `runs`, `tasks`, `agent_messages`, `agent_logs`, `iterations`. Todas tienen **RLS activado sin políticas**: solo el servidor (con la service role key) puede leer y escribir; la clave pública no tiene acceso.

Sin Supabase, el historial se guarda en memoria del proceso (máx. 50 ejecuciones) y se pierde al reiniciar. En Vercel cada instancia serverless tiene su propia memoria, así que para un historial fiable en producción configura Supabase.

## Despliegue en Vercel

1. Sube el proyecto a un repositorio de GitHub (comprueba que `.env.local` **no** se sube; ya está en `.gitignore`).
2. En Vercel: **Add New → Project** e importa el repositorio. El framework (Next.js) se detecta automáticamente.
3. (Opcional) En **Settings → Environment Variables** añade `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y, si quieres el modo LLM, `AGENTFLOW_MODE=llm` y `ANTHROPIC_API_KEY`.
4. Despliega. Sin variables, la app funciona en modo demo.
5. Comprueba `https://<tu-app>.vercel.app/api/health`: muestra el modo y la persistencia activos.

La ruta `POST /api/runs` declara `maxDuration = 300` s para las ejecuciones con modelos reales; el límite efectivo depende de tu plan de Vercel.

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/runs` | Body `{ "prompt": string (5–2000), "maxIterations"?: 1–10 }`. Responde `application/x-ndjson` con un evento por línea. |
| `GET` | `/api/runs` | Últimas 30 ejecuciones (resumen). |
| `GET` | `/api/runs/:id` | Ejecución completa (tareas, mensajes, logs, iteraciones). |
| `GET` | `/api/health` | Modo, proveedor, persistencia y límites. |

Tipos de evento: `run_started`, `agent_status`, `task_created`, `task_updated`, `message`, `log`, `iteration`, `error`, `run_finished`.

## Seguridad

- Ningún secreto llega al navegador: claves solo en variables de servidor sin `NEXT_PUBLIC_`; `/api/health` no devuelve claves ni URLs (cubierto por un test).
- `.env*` excluido de Git (salvo `.env.example`, que no contiene valores).
- Validación de entrada: longitud del prompt, eliminación de caracteres de control, rango entero de iteraciones y UUID en `/api/runs/:id`.
- Rate limiting por IP en `POST /api/runs` (10 ejecuciones/minuto, en memoria, *best effort* en despliegues con varias instancias).
- Errores internos registrados en el servidor; al cliente solo llegan mensajes genéricos.
- Cabeceras de seguridad (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Supabase con RLS activado y sin políticas públicas.
- El código que generan los agentes **no se ejecuta**: solo se muestra.

## Tests

```bash
npm test
```

Cubren: el motor del workflow (éxito, ciclo de feedback, límite de iteraciones, errores de proveedor, cancelación, orden de eventos), el proveedor demo y la coherencia de su catálogo, la selección de proveedor según el entorno, la validación de entrada, el rate limiting, el reductor de estado de la UI, el parser NDJSON, el repositorio en memoria, el servicio de streaming (incluido el fallo de persistencia) y las rutas de la API.

El modo LLM y el repositorio de Supabase no tienen tests contra servicios reales (requerirían credenciales y generarían coste); comparten la interfaz probada con sus equivalentes demo/memoria.

## Limitaciones conocidas

- En modo demo, las plantillas cubren cuatro tipos de petición; otras peticiones usan la plantilla genérica.
- El rate limiting y el historial en memoria son por instancia.
- Las ejecuciones se procesan dentro de la petición HTTP; para flujos LLM muy largos convendría una cola de trabajos.

## Herramientas de IA utilizadas

Este proyecto se completó con la ayuda de **Claude Code** (Anthropic), que inspeccionó el andamiaje inicial, implementó la arquitectura, escribió los tests, ejecutó tests y compilación y revisó el resultado en el navegador.
