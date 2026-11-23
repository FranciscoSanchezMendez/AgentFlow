import { describe, expect, it } from 'vitest';
import { diffLines, diffStats, foldDiff } from '@/lib/diff';
import type { FileChange } from '@/lib/types';
import { PREVIEW_CSP, buildPreviewDocument, buildWorkspace, sanitizePath, workspaceSteps } from '@/lib/workspace';

const change = (over: Partial<FileChange>): FileChange => ({
  id: Math.random().toString(36),
  runId: 'r',
  taskId: 't1',
  iteration: 1,
  path: 'a.txt',
  kind: 'created',
  before: null,
  after: 'x',
  createdAt: '',
  ...over,
});

describe('sanitizePath', () => {
  it.each([
    ['index.html', 'index.html'],
    ['./src/app.js', 'src/app.js'],
    ['src\\util.ts', 'src/util.ts'],
  ])('acepta «%s»', (input, expected) => {
    expect(sanitizePath(input)).toBe(expected);
  });

  it.each(['../secret', 'a/../../b', '/etc/passwd', 'C:/Windows/x', '', 'a//b', 'a b.txt', 'x'.repeat(200), 42, null])('rechaza %j', (input) => {
    expect(sanitizePath(input)).toBeNull();
  });
});

describe('buildWorkspace y workspaceSteps', () => {
  const changes = [
    change({ path: 'a.txt', after: '1' }),
    change({ path: 'b.txt', after: '2' }),
    change({ path: 'a.txt', kind: 'modified', before: '1', after: '1b', iteration: 2 }),
    change({ path: 'b.txt', kind: 'deleted', before: '2', after: null, taskId: 't2' }),
  ];

  it('reconstruye el estado en cualquier punto del historial', () => {
    expect([...buildWorkspace(changes, 2).keys()]).toEqual(['a.txt', 'b.txt']);
    const final = buildWorkspace(changes);
    expect([...final.keys()]).toEqual(['a.txt']);
    expect(final.get('a.txt')).toMatchObject({ content: '1b', status: 'modified', iteration: 2 });
    expect(buildWorkspace(changes, 1).get('a.txt')?.status).toBe('created');
  });

  it('agrupa los cambios por tarea e iteración', () => {
    expect(workspaceSteps(changes).map((s) => [s.taskId, s.iteration, s.upto, s.paths.join(',')])).toEqual([
      ['t1', 1, 2, 'a.txt,b.txt'],
      ['t1', 2, 3, 'a.txt'],
      ['t2', 1, 4, 'b.txt'],
    ]);
  });
});

describe('buildPreviewDocument', () => {
  const files = {
    'index.html': '<html><head><link rel="stylesheet" href="styles.css" /></head><body><script src="app.js"></script><script src="https://evil.example/x.js"></script></body></html>',
    'styles.css': 'body { color: red; }',
    'app.js': 'var s = "</script><script>alert(1)</script>";',
  };

  it('incrusta CSS y JS locales, elimina recursos externos y añade la CSP', () => {
    const doc = buildPreviewDocument(files)!;
    expect(doc).toContain('body { color: red; }');
    expect(doc).toContain('data-file="app.js"');
    expect(doc).not.toContain('evil.example');
    expect(doc).toContain(PREVIEW_CSP);
    expect(PREVIEW_CSP).toContain("default-src 'none'");
  });

  it('escapa los cierres de etiqueta dentro de los scripts', () => {
    const doc = buildPreviewDocument(files)!;
    expect(doc).toContain('<\\/script><script>alert(1)<\\/script>');
  });

  it('añade un script extra antes de </body> y devuelve null sin index.html', () => {
    expect(buildPreviewDocument(files, 'window.x = 1;')).toMatch(/window\.x = 1;\n<\/script>\n<\/body>/);
    expect(buildPreviewDocument({ 'app.js': '' })).toBeNull();
  });
});

describe('diffLines', () => {
  it('detecta líneas añadidas, eliminadas y sin cambios', () => {
    const lines = diffLines('a\nb\nc\n', 'a\nB\nc\nd\n');
    expect(lines.map((l) => `${l.type}:${l.text}`)).toEqual(['same:a', 'del:b', 'add:B', 'same:c', 'add:d']);
    expect(diffStats(lines)).toEqual({ added: 2, removed: 1 });
  });

  it('un archivo nuevo es todo añadido y uno eliminado todo borrado', () => {
    expect(diffLines(null, 'x\ny').every((l) => l.type === 'add')).toBe(true);
    expect(diffLines('x\ny', null).every((l) => l.type === 'del')).toBe(true);
  });

  it('pliega los tramos largos sin cambios', () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n');
    const after = before.replace('l10', 'L10');
    const items = foldDiff(diffLines(before, after), 2);
    expect(items[0]).toEqual({ type: 'fold', count: 8 });
    expect(items.filter((i) => i.type === 'add')).toHaveLength(1);
    expect(items.at(-1)).toEqual({ type: 'fold', count: 7 });
  });
});
