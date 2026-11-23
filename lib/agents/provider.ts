import type { AcceptanceCriterion, RunMode, TestResult } from '../types';

/**
 * Contrato que debe cumplir cualquier "cerebro" de los agentes.
 *
 * - `DemoProvider`: determinista, sin red ni coste.
 * - `AnthropicProvider`: llama a un modelo real cuando hay API key.
 *
 * Para integrar otro proveedor basta con implementar esta interfaz y
 * registrarlo en `lib/agents/factory.ts`.
 */

export interface PlannedTask {
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
}

export interface PlanInput {
  prompt: string;
}

export interface PlanOutput {
  rationale: string;
  tasks: PlannedTask[];
}

export interface ImplementInput {
  prompt: string;
  task: PlannedTask & { id: string };
  attempt: number;
  previousCode?: string;
  feedback: string[];
}

export interface ImplementOutput {
  code: string;
  notes: string;
}

export interface ReviewInput {
  prompt: string;
  task: PlannedTask & { id: string };
  code: string;
  attempt: number;
}

export interface ReviewOutput {
  results: TestResult[];
  feedback: string[];
}

export interface AgentProvider {
  readonly mode: RunMode;
  readonly label: string;
  /** Orchestrator: descompone la petición en tareas. */
  plan(input: PlanInput): Promise<PlanOutput>;
  /** Develop: implementa (o corrige) una tarea. */
  implement(input: ImplementInput): Promise<ImplementOutput>;
  /** Testing: verifica una implementación contra sus criterios. */
  review(input: ReviewInput): Promise<ReviewOutput>;
}

/**
 * Verificación estática compartida: comprueba que el código contiene los
 * fragmentos esperados por cada criterio. Es real (no simulada): si falta un
 * fragmento, el test falla.
 */
export function staticReview(code: string, criteria: AcceptanceCriterion[]): ReviewOutput {
  const results: TestResult[] = criteria.map((criterion) => {
    const expected = criterion.expect ?? [];
    const missing = expected.filter((fragment) => !code.includes(fragment));
    const passed = missing.length === 0;
    return {
      criterionId: criterion.id,
      name: criterion.description,
      passed,
      detail: passed
        ? 'Criterio verificado en el código.'
        : `No se encontró: ${missing.map((m) => `\`${m}\``).join(', ')}`,
    };
  });
  const feedback = results
    .filter((r) => !r.passed)
    .map((r) => `[${r.criterionId}] ${r.name} — ${r.detail}`);
  return { results, feedback };
}
