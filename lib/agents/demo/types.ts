/**
 * Tipos del catálogo del modo demo.
 *
 * Cada dominio define las tareas que crearía el Orchestrator, sus criterios de
 * aceptación (asociados a un archivo) y las plantillas de los archivos que
 * escribe Develop. Las plantillas contienen marcadores `@@id-del-criterio@@` en
 * líneas propias: Develop sustituye cada marcador por el código que satisface
 * ese criterio, o por `fallback` cuando lo "olvida" en el primer intento.
 *
 * Placeholders disponibles en las plantillas:
 *  - `{{TITLE}}`: título derivado de la petición del usuario (HTML escapado).
 *  - `{{PROMPT}}`: petición original (HTML escapado).
 */

export interface DemoCriterion {
  id: string;
  description: string;
  file: string;
  expect: string[];
  snippet: string;
  /** Código que deja Develop cuando omite el criterio (por defecto, nada). */
  fallback?: string;
}

export interface DemoTask {
  title: string;
  description: string;
  /** Cuántos criterios (los últimos de la tarea) omite Develop en el primer intento. */
  misses: number;
  criteria: DemoCriterion[];
}

export interface DemoDomain {
  id: string;
  label: string;
  keywords: RegExp;
  tasks: DemoTask[];
  templates: Record<string, string>;
}
