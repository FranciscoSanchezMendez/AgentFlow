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
}

export interface PlanOutput {
  rationale: string;
  tasks: PlannedTask[];
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
    const base = { criterionId: criterion.id, name: criterion.description, file: criterion.file };

    if (criterion.file && files[criterion.file] === undefined) {
      return { ...base, passed: false, detail: `El archivo ${criterion.file} no existe en el workspace.` };
    }
    const content = criterion.file ? files[criterion.file] : all;
    const missing = expected.filter((fragment) => !content.includes(fragment));
    const passed = missing.length === 0;
    const where = criterion.file ? ` en ${criterion.file}` : '';
    return {
      ...base,
      passed,
      detail: passed
        ? `Verificado${where} (${expected.length} comprobación${expected.length === 1 ? '' : 'es'}).`
        : `No se encontró${where}: ${missing.map((m) => `\`${m}\``).join(', ')}`,
    };
  });
  const feedback = results
    .filter((r) => !r.passed)
    .map((r) => `[${r.criterionId}] ${r.name} — ${r.detail}`);
  return { results, feedback };
}
