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

/** Archivos del workspace: ruta relativa → contenido. */
export type WorkspaceSnapshot = Record<string, string>;

export interface ArtifactFile {
  path: string;
  content: string;
}

export interface PlanInput {
  prompt: string;
  /** Memoria del hilo: peticiones anteriores y workspace actual. */
  context?: { history: string[]; files: WorkspaceSnapshot };
}

export interface PlanOutput {
  rationale: string;
  tasks: PlannedTask[];
  /**
   * Solo cuando no hay tareas: 'noop' si no hace falta cambiar nada y
   * 'unsupported' si el proveedor no sabe implementar la petición.
   */
  outcome?: 'noop' | 'unsupported';
}

export interface ImplementInput {
  prompt: string;
  task: PlannedTask & { id: string };
  attempt: number;
  /** Estado actual del workspace (incluye el trabajo de tareas anteriores). */
  workspace: WorkspaceSnapshot;
  feedback: string[];
}

export interface ImplementOutput {
  /** Archivos completos que Develop crea o reescribe. */
  files: ArtifactFile[];
  /** Rutas que Develop elimina. */
  deleted?: string[];
  notes: string;
}

export interface ReviewInput {
  prompt: string;
  task: PlannedTask & { id: string };
  /** Workspace tras la entrega de Develop. */
  files: WorkspaceSnapshot;
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
  /** Develop: crea o corrige los archivos de una tarea. */
  implement(input: ImplementInput): Promise<ImplementOutput>;
  /** Testing: inspecciona los archivos y valida los criterios de la tarea. */
  review(input: ReviewInput): Promise<ReviewOutput>;
}

/**
 * Verificación estática compartida: abre el archivo asociado a cada criterio y
 * comprueba que contiene los fragmentos esperados. Es real (no simulada): si el
 * archivo no existe o falta un fragmento, la prueba falla con el motivo.
 */
export function staticReview(files: WorkspaceSnapshot, criteria: AcceptanceCriterion[]): ReviewOutput {
  const all = Object.values(files).join('\n');
  const results: TestResult[] = criteria.map((criterion) => {
    const expected = criterion.expect ?? [];
    const forbidden = criterion.absent ?? [];
    const base = { criterionId: criterion.id, name: criterion.description, file: criterion.file };
    const where = criterion.file ? ` en ${criterion.file}` : '';

    if (criterion.file && files[criterion.file] === undefined) {
      // Un criterio solo de ausencia se cumple si el archivo ya no existe (p. ej. se eliminó).
      if (expected.length === 0 && forbidden.length > 0) {
        return { ...base, passed: true, detail: `${criterion.file} ya no existe en el workspace.` };
      }
      return { ...base, passed: false, detail: `El archivo ${criterion.file} no existe en el workspace.` };
    }
    const content = criterion.file ? files[criterion.file] : all;
    const missing = expected.filter((fragment) => !content.includes(fragment));
    const present = forbidden.filter((fragment) => content.includes(fragment));
    const passed = missing.length === 0 && present.length === 0;
    const checks = expected.length + forbidden.length;
    const problems = [
      missing.length ? `No se encontró${where}: ${missing.map((m) => `\`${m}\``).join(', ')}` : '',
      present.length ? `Sigue apareciendo${where}: ${present.map((m) => `\`${m}\``).join(', ')}` : '',
    ].filter(Boolean);
    return {
      ...base,
      passed,
      detail: passed ? `Verificado${where} (${checks} comprobación${checks === 1 ? '' : 'es'}).` : problems.join(' · '),
    };
  });
  const feedback = results
    .filter((r) => !r.passed)
    .map((r) => `[${r.criterionId}] ${r.name} — ${r.detail}`);
  return { results, feedback };
}
