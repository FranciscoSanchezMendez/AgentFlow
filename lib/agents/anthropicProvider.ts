import Anthropic from '@anthropic-ai/sdk';
import type {
  AgentProvider,
  ImplementInput,
  ImplementOutput,
  PlanInput,
  PlanOutput,
  ReviewInput,
  ReviewOutput,
} from './provider';
import { staticReview } from './provider';

/**
 * Proveedor con modelos reales de Claude (Anthropic).
 *
 * Solo se activa si `AGENTFLOW_MODE=llm` y existe `ANTHROPIC_API_KEY` en el
 * servidor. Cada agente tiene su propio prompt de sistema y devuelve JSON
 * validado mediante structured outputs (`output_config.format`).
 */

export const DEFAULT_MODEL = 'claude-opus-5-5';

type JsonSchema = Record<string, unknown>;

const PLAN_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['rationale', 'tasks'],
  properties: {
    rationale: { type: 'string' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'acceptanceCriteria'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          acceptanceCriteria: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'description'],
              properties: { id: { type: 'string' }, description: { type: 'string' } },
            },
          },
        },
      },
    },
  },
};

const IMPLEMENT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'notes'],
  properties: { code: { type: 'string' }, notes: { type: 'string' } },
};

const REVIEW_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterionId', 'passed', 'detail'],
        properties: {
          criterionId: { type: 'string' },
          passed: { type: 'boolean' },
          detail: { type: 'string' },
        },
      },
    },
  },
};

const SYSTEM = {
  orchestrator:
    'Eres Orchestrator, el agente coordinador de un equipo de desarrollo. Descompones la petición del usuario en entre 2 y 5 tareas de programación pequeñas, independientes y verificables. Cada tarea tiene entre 2 y 4 criterios de aceptación concretos y comprobables leyendo el código. Usa ids cortos en kebab-case para los criterios. Responde en español.',
  develop:
    'Eres Develop, el agente programador. Escribes código TypeScript/React claro y completo para la tarea indicada. Si recibes feedback de Testing, corriges exactamente esos puntos sin romper lo que ya funcionaba. Devuelve solo el código del archivo en "code" y un resumen breve en "notes". Responde en español.',
  testing:
    'Eres Testing, el agente de QA. Revisas el código frente a cada criterio de aceptación y decides con rigor si se cumple. Para cada criterio devuelve passed y un detalle breve y accionable que Develop pueda usar para corregir. No apruebes criterios que no estén implementados. Responde en español.',
} as const;

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  client?: Anthropic;
}

export class AnthropicProvider implements AgentProvider {
  readonly mode = 'llm' as const;
  readonly label: string;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor({ apiKey, model, client }: AnthropicProviderOptions) {
    this.client = client ?? new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
    this.model = model || DEFAULT_MODEL;
    this.label = `Anthropic · ${this.model}`;
  }

  async plan({ prompt }: PlanInput): Promise<PlanOutput> {
    const out = await this.callJson<PlanOutput>(SYSTEM.orchestrator, `Petición del usuario:\n${prompt}`, PLAN_SCHEMA);
    if (!Array.isArray(out.tasks) || out.tasks.length === 0) {
      throw new Error('El Orchestrator no devolvió ninguna tarea.');
    }
    return { rationale: out.rationale, tasks: out.tasks.slice(0, 6) };
  }

  async implement({ prompt, task, attempt, previousCode, feedback }: ImplementInput): Promise<ImplementOutput> {
    const parts = [
      `Petición original: ${prompt}`,
      `Tarea: ${task.title}\n${task.description}`,
      `Criterios de aceptación:\n${task.acceptanceCriteria.map((c) => `- [${c.id}] ${c.description}`).join('\n')}`,
      `Intento número ${attempt}.`,
    ];
    if (previousCode) parts.push(`Código del intento anterior:\n${previousCode}`);
    if (feedback.length) parts.push(`Feedback de Testing que debes corregir:\n${feedback.map((f) => `- ${f}`).join('\n')}`);
    return this.callJson<ImplementOutput>(SYSTEM.develop, parts.join('\n\n'), IMPLEMENT_SCHEMA);
  }

  async review({ task, code }: ReviewInput): Promise<ReviewOutput> {
    // Si los criterios traen fragmentos esperados, se verifican de forma estática.
    if (task.acceptanceCriteria.every((c) => c.expect && c.expect.length > 0)) {
      return staticReview(code, task.acceptanceCriteria);
    }
    const out = await this.callJson<{ results: { criterionId: string; passed: boolean; detail: string }[] }>(
      SYSTEM.testing,
      `Tarea: ${task.title}\n${task.description}\n\nCriterios:\n${task.acceptanceCriteria
        .map((c) => `- [${c.id}] ${c.description}`)
        .join('\n')}\n\nCódigo a revisar:\n${code}`,
      REVIEW_SCHEMA,
    );
    const byId = new Map(out.results.map((r) => [r.criterionId, r]));
    const results = task.acceptanceCriteria.map((c) => {
      const r = byId.get(c.id);
      return {
        criterionId: c.id,
        name: c.description,
        passed: r?.passed ?? false,
        detail: r?.detail ?? 'Testing no evaluó este criterio.',
      };
    });
    const feedback = results.filter((r) => !r.passed).map((r) => `[${r.criterionId}] ${r.name} — ${r.detail}`);
    return { results, feedback };
  }

  private async callJson<T>(system: string, user: string, schema: JsonSchema): Promise<T> {
    // `fallbacks: 'default'`: si el modelo declina por política, la API reintenta
    // la misma petición con un modelo de respaldo dentro de la misma llamada.
    const response = await this.client.beta.messages.create({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      model: this.model,
      max_tokens: 16000,
      system,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: user }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('El modelo rechazó la petición.');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('La respuesta del modelo se cortó por longitud.');
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error('El modelo devolvió una respuesta que no es JSON válido.');
    }
  }
}
