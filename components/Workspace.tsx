'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PREVIEW_TEST_SCRIPT, isPreviewTestMessage, type PreviewTestMessage } from '@/lib/client/previewTests';
import { diffLines, diffStats, foldDiff } from '@/lib/diff';
import type { FileChange, Iteration, Run, Task, WorkspaceFile } from '@/lib/types';
import { buildPreviewDocument, buildWorkspace, languageOf, snapshotOf, workspaceSteps } from '@/lib/workspace';
import { Badge } from './ui';

type Tab = 'files' | 'changes' | 'preview' | 'tests';

const KIND_LABEL: Record<FileChange['kind'], string> = { created: 'Nuevo', modified: 'Modificado', deleted: 'Eliminado' };

export interface WorkspaceFocus {
  path: string;
  nonce: number;
}

export function Workspace({ run, focus }: { run: Run | null; focus: WorkspaceFocus | null }) {
  const changes = useMemo(() => run?.changes ?? [], [run?.changes]);
  const steps = useMemo(() => workspaceSteps(changes), [changes]);
  const tasks = useMemo(() => new Map((run?.tasks ?? []).map((t) => [t.id, t])), [run?.tasks]);

  const [tab, setTab] = useState<Tab>('preview');
  const [stepIdx, setStepIdx] = useState<number | null>(null); // null = seguir el último
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // Al cambiar de ejecución, volver a la última versión.
  useEffect(() => {
    setStepIdx(null);
    setSelectedPath(null);
    setSelectedChangeId(null);
  }, [run?.id]);

  // Abrir un archivo desde el tablero de tareas.
  useEffect(() => {
    if (!focus) return;
    setStepIdx(null);
    setTab('files');
    setSelectedPath(focus.path);
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus]);

  const activeStep = stepIdx === null ? steps.length - 1 : Math.min(stepIdx, steps.length - 1);
  const step = steps[activeStep];
  const upto = step?.upto ?? 0;
  const files = useMemo(() => buildWorkspace(changes, upto), [changes, upto]);
  const visibleChanges = useMemo(() => changes.slice(0, upto), [changes, upto]);
  const snapshot = useMemo(() => snapshotOf(files), [files]);
  const stepVerdict = step ? findIteration(run, step.taskId, step.iteration) : undefined;

  const counts = useMemo(() => {
    const c = { created: 0, modified: 0, deleted: 0 };
    for (const ch of visibleChanges) c[ch.kind]++;
    return c;
  }, [visibleChanges]);

  const empty = changes.length === 0;

  return (
    <section ref={sectionRef} className="card panel workspace" aria-labelledby="ws-title" id="workspace">
      <header className="panel-head">
        <div>
          <p className="eyebrow">Artefactos de Develop</p>
          <h2 id="ws-title">Workspace</h2>
        </div>
        {!empty && (
          <div className="ws-counters" aria-label="Resumen de cambios">
            <span className={`ws-count ${counts.created ? 'kind-created' : 'is-zero'}`}>{counts.created} nuevos</span>
            <span className={`ws-count ${counts.modified ? 'kind-modified' : 'is-zero'}`}>{counts.modified} modificaciones</span>
            <span className={`ws-count ${counts.deleted ? 'kind-deleted' : 'is-zero'}`}>{counts.deleted} eliminados</span>
            <span className="muted">{files.size} archivo(s)</span>
          </div>
        )}
      </header>

      {empty ? (
        <p className="empty">
          Cuando Develop escriba archivos aparecerán aquí: el árbol del proyecto, cada cambio con su diff, la vista previa funcionando y
          las pruebas de Testing.
        </p>
      ) : (
        <>
          <div className="ws-version">
            <label htmlFor="ws-step">Versión del workspace</label>
            <select id="ws-step" value={activeStep} onChange={(e) => setStepIdx(Number(e.target.value) === steps.length - 1 ? null : Number(e.target.value))}>
              {steps.map((s, i) => {
                const task = tasks.get(s.taskId);
                const verdict = findIteration(run, s.taskId, s.iteration);
                return (
                  <option key={`${s.taskId}-${s.iteration}`} value={i}>
                    {`Paso ${i + 1} · T${(task?.position ?? 0) + 1} ${task?.title ?? ''} · iteración ${s.iteration}${verdict ? (verdict.passed ? ' · ✓ aprobada' : ' · ✕ con fallos') : ''}${i === steps.length - 1 ? ' (última)' : ''}`}
                  </option>
                );
              })}
            </select>
            {step && (
              <p className="ws-step-info">
                <strong>{tasks.get(step.taskId)?.title}</strong> · iteración {step.iteration} · {step.paths.join(', ')}
                {stepVerdict && (
                  <Badge kind={stepVerdict.passed ? 'completed' : 'failed'}>{stepVerdict.passed ? 'Testing: aprobada' : 'Testing: con fallos'}</Badge>
                )}
              </p>
            )}
          </div>

          <div className="ws-tabs" role="tablist" aria-label="Vistas del workspace">
            {(
              [
                ['preview', 'Vista previa'],
                ['files', 'Archivos'],
                ['changes', `Cambios (${visibleChanges.length})`],
                ['tests', 'Pruebas'],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`ws-tab ${tab === id ? 'is-on' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab === 'files' && (
            <FilesView
              files={files}
              changedNow={new Set(step?.paths ?? [])}
              tasks={tasks}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          )}
          {tab === 'changes' && (
            <ChangesView changes={visibleChanges} tasks={tasks} selectedId={selectedChangeId} onSelect={setSelectedChangeId} />
          )}
          {tab === 'preview' && <PreviewView snapshot={snapshot} versionKey={`${run?.id}-${upto}`} />}
          {tab === 'tests' && (
            <TestsView
              run={run!}
              onOpenFile={(path) => {
                setTab('files');
                setSelectedPath(path);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}

function findIteration(run: Run | null, taskId: string, number: number): Iteration | undefined {
  return run?.iterations.find((i) => i.taskId === taskId && i.number === number);
}

/* ----------------------------- Archivos ----------------------------- */

function FilesView({
  files,
  changedNow,
  tasks,
  selectedPath,
  onSelect,
}: {
  files: Map<string, WorkspaceFile>;
  changedNow: Set<string>;
  tasks: Map<string, Task>;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const list = [...files.values()];
  const current = (selectedPath && files.get(selectedPath)) || list[0];
  const tree = groupByDir(list);

  return (
    <div className="ws-files">
      <nav className="ws-tree" aria-label="Árbol de archivos">
        {tree.map(([dir, entries]) => (
          <div key={dir || '/'} className="ws-dir">
            {dir && <p className="ws-dir-name">📁 {dir}/</p>}
            <ul>
              {entries.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    className={`ws-file ${current?.path === f.path ? 'is-on' : ''}`}
                    onClick={() => onSelect(f.path)}
                    aria-current={current?.path === f.path}
                  >
                    <span className="ws-file-name">{f.path.split('/').pop()}</span>
                    <span className={`ws-dot status-${f.status}`} title={f.status === 'created' ? 'Nuevo' : 'Modificado'} />
                    {changedNow.has(f.path) && <span className="ws-now">este paso</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {current ? (
        <div className="ws-viewer">
          <div className="ws-viewer-head">
            <strong>{current.path}</strong>
            <span className="muted">{languageOf(current.path)}</span>
            <Badge kind={current.status === 'created' ? 'completed' : 'in_review'}>{current.status === 'created' ? 'Nuevo' : 'Modificado'}</Badge>
            <span className="muted">
              Último cambio: T{(tasks.get(current.taskId)?.position ?? 0) + 1} · iteración {current.iteration}
            </span>
          </div>
          <CodeBlock content={current.content} />
        </div>
      ) : (
        <p className="empty">El workspace está vacío en esta versión.</p>
      )}
    </div>
  );
}

function groupByDir(files: WorkspaceFile[]): [string, WorkspaceFile[]][] {
  const groups = new Map<string, WorkspaceFile[]>();
  for (const f of files) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
    groups.set(dir, [...(groups.get(dir) ?? []), f]);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
}

function CodeBlock({ content }: { content: string }) {
  const lines = content.replace(/\n$/, '').split('\n');
  return (
    <pre className="code ws-code">
      <code>
        {lines.map((line, i) => (
          <span key={i} className="code-line">
            <span className="ln" aria-hidden>
              {i + 1}
            </span>
            {line || ' '}
            {'\n'}
          </span>
        ))}
      </code>
    </pre>
  );
}

/* ----------------------------- Cambios ----------------------------- */

function ChangesView({
  changes,
  tasks,
  selectedId,
  onSelect,
}: {
  changes: FileChange[];
  tasks: Map<string, Task>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ordered = [...changes].reverse();
  const current = ordered.find((c) => c.id === selectedId) ?? ordered[0];
  const lines = useMemo(() => (current ? diffLines(current.before, current.after) : []), [current]);
  const items = useMemo(() => foldDiff(lines, 3), [lines]);

  return (
    <div className="ws-changes">
      <ol className="ws-change-list" aria-label="Historial de cambios">
        {ordered.map((c) => {
          const task = tasks.get(c.taskId);
          const stats = diffStats(diffLines(c.before, c.after));
          return (
            <li key={c.id}>
              <button type="button" className={`ws-change ${current?.id === c.id ? 'is-on' : ''}`} onClick={() => onSelect(c.id)}>
                <span className={`ws-kind kind-${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                <span className="ws-change-path">{c.path}</span>
                <span className="ws-change-meta">
                  T{(task?.position ?? 0) + 1} · it. {c.iteration} · <span className="add">+{stats.added}</span> <span className="del">−{stats.removed}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {current && (
        <div className="ws-viewer">
          <div className="ws-viewer-head">
            <strong>{current.path}</strong>
            <span className={`ws-kind kind-${current.kind}`}>{KIND_LABEL[current.kind]}</span>
            <span className="muted">
              {tasks.get(current.taskId)?.title} · iteración {current.iteration}
            </span>
          </div>
          {current.kind === 'created' && <p className="ws-note">Archivo nuevo: no existe versión anterior.</p>}
          {current.kind === 'deleted' && <p className="ws-note">Archivo eliminado por Develop.</p>}
          <pre className="code diff" aria-label={`Diff de ${current.path}`}>
            <code>
              {items.map((item, i) =>
                item.type === 'fold' ? (
                  <span key={i} className="diff-line diff-fold">
                    ⋯ {item.count} líneas sin cambios{'\n'}
                  </span>
                ) : (
                  <span key={i} className={`diff-line diff-${item.type}`}>
                    <span className="ln" aria-hidden>
                      {item.type === 'add' ? '' : item.oldNo}
                    </span>
                    <span className="ln" aria-hidden>
                      {item.type === 'del' ? '' : item.newNo}
                    </span>
                    <span className="sign" aria-hidden>
                      {item.type === 'add' ? '+' : item.type === 'del' ? '−' : ' '}
                    </span>
                    {item.text || ' '}
                    {'\n'}
                  </span>
                ),
              )}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Vista previa ----------------------------- */

function PreviewView({ snapshot, versionKey }: { snapshot: Record<string, string>; versionKey: string }) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [reloadKey, setReloadKey] = useState(0);
  const [tests, setTests] = useState<PreviewTestMessage | null>(null);
  const testFrame = useRef<HTMLIFrameElement>(null);

  const doc = useMemo(() => buildPreviewDocument(snapshot), [snapshot]);
  const testDoc = useMemo(() => buildPreviewDocument(snapshot, PREVIEW_TEST_SCRIPT), [snapshot]);

  useEffect(() => {
    setTests(null);
    function onMessage(event: MessageEvent) {
      // Solo se aceptan mensajes del iframe de pruebas (origen opaco "null").
      if (event.source !== testFrame.current?.contentWindow) return;
      if (isPreviewTestMessage(event.data)) setTests(event.data);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [versionKey, reloadKey]);

  if (!doc) {
    return (
      <p className="empty">
        Esta ejecución no ha generado una página web (<code>index.html</code>), así que no hay vista previa. Revisa los archivos y sus cambios en
        las otras pestañas.
      </p>
    );
  }

  const passed = tests?.results.filter((r) => r.passed).length ?? 0;

  return (
    <div className="ws-preview">
      <div className="ws-preview-bar">
        <div className="seg" role="group" aria-label="Tamaño de la vista previa">
          <button type="button" className={device === 'desktop' ? 'is-on' : ''} onClick={() => setDevice('desktop')} aria-pressed={device === 'desktop'}>
            Escritorio
          </button>
          <button type="button" className={device === 'mobile' ? 'is-on' : ''} onClick={() => setDevice('mobile')} aria-pressed={device === 'mobile'}>
            Móvil
          </button>
        </div>
        <button type="button" className="icon-btn" onClick={() => setReloadKey((k) => k + 1)} title="Recargar y repetir pruebas" aria-label="Recargar vista previa">
          ↻
        </button>
        <span className="muted">Sandbox aislado · sin red · sin acceso a la app</span>
      </div>
      <div className="ws-preview-grid">
        <div className={`ws-frame-wrap device-${device}`}>
          <iframe
            key={`${versionKey}-${reloadKey}`}
            title="Vista previa del resultado"
            className="ws-frame"
            sandbox="allow-scripts allow-forms"
            srcDoc={doc}
            referrerPolicy="no-referrer"
          />
        </div>
        <aside className="ws-ptests" aria-live="polite">
          <h3>Pruebas de interacción</h3>
          <p className="muted">
            Ejecutadas en tu navegador sobre esta versión, en un iframe aislado: rellenan el formulario, lo envían y comprueban el resultado.
          </p>
          {!tests ? (
            <p className="muted">Ejecutando…</p>
          ) : tests.note ? (
            <p className="muted">{tests.note}</p>
          ) : (
            <>
              <p className={`ws-ptests-score ${passed === tests.results.length ? 'ok' : 'ko'}`}>
                {passed}/{tests.results.length} superadas
              </p>
              <ul className="criteria">
                {tests.results.map((r) => (
                  <li key={r.name} className={`criterion criterion-${r.passed ? 'pass' : 'fail'}`}>
                    <span aria-hidden>{r.passed ? '✓' : '✕'}</span>
                    <div>
                      {r.name}
                      <small className={r.passed ? 'ok' : ''}>{r.detail}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
      {/* Iframe oculto donde se ejecutan las pruebas, para no alterar la vista previa visible. */}
      {testDoc && (
        <iframe
          key={`tests-${versionKey}-${reloadKey}`}
          ref={testFrame}
          title="Pruebas de la vista previa"
          className="ws-test-frame"
          sandbox="allow-scripts"
          srcDoc={testDoc}
          aria-hidden
          tabIndex={-1}
        />
      )}
    </div>
  );
}

/* ----------------------------- Pruebas de Testing ----------------------------- */

function TestsView({ run, onOpenFile }: { run: Run; onOpenFile: (path: string) => void }) {
  const tasks = run.tasks;
  return (
    <div className="ws-tests">
      <p className="muted">
        Validación de Testing: en cada iteración inspecciona los archivos del workspace y comprueba cada criterio de aceptación.
      </p>
      {tasks.map((task) => {
        const iterations = run.iterations.filter((i) => i.taskId === task.id);
        if (iterations.length === 0) return null;
        return (
          <article key={task.id} className="ws-test-task">
            <h3>
              T{task.position + 1} · {task.title}
            </h3>
            {iterations.map((it) => (
              <div key={it.id} className="ws-test-iter">
                <p className="ws-test-iter-head">
                  <span className={`iter ${it.passed ? 'iter-pass' : 'iter-fail'}`}>{it.number}</span>
                  Iteración {it.number}: {it.results.filter((r) => r.passed).length}/{it.results.length} pruebas superadas
                </p>
                <ul className="criteria">
                  {it.results.map((r) => (
                    <li key={r.criterionId} className={`criterion criterion-${r.passed ? 'pass' : 'fail'}`}>
                      <span aria-hidden>{r.passed ? '✓' : '✕'}</span>
                      <div>
                        {r.name}
                        {r.file && (
                          <button type="button" className="file-chip" onClick={() => onOpenFile(r.file!)}>
                            {r.file}
                          </button>
                        )}
                        <small className={r.passed ? 'ok' : ''}>{r.detail}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </article>
        );
      })}
    </div>
  );
}
