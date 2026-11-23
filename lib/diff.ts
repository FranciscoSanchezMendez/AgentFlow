/**
 * Diff de líneas basado en LCS (subsecuencia común más larga), sin dependencias.
 */

export type DiffLine =
  | { type: 'same'; text: string; oldNo: number; newNo: number }
  | { type: 'add'; text: string; newNo: number }
  | { type: 'del'; text: string; oldNo: number };

export type DiffItem = DiffLine | { type: 'fold'; count: number };

const MAX_CELLS = 4_000_000;

function splitLines(text: string | null): string[] {
  if (text === null || text === '') return [];
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
}

export function diffLines(before: string | null, after: string | null): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;

  // Archivos demasiado grandes: diff trivial (todo eliminado + todo añadido).
  if (n * m > MAX_CELLS) {
    return [
      ...a.map((text, i) => ({ type: 'del' as const, text, oldNo: i + 1 })),
      ...b.map((text, i) => ({ type: 'add' as const, text, newNo: i + 1 })),
    ];
  }

  // lcs[i][j] = longitud de la LCS de a[i..] y b[j..]
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i], oldNo: i + 1, newNo: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: 'del', text: a[i], oldNo: i + 1 });
      i++;
    } else {
      out.push({ type: 'add', text: b[j], newNo: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i], oldNo: ++i });
  while (j < m) out.push({ type: 'add', text: b[j], newNo: ++j });
  return out;
}

/** Pliega los tramos sin cambios dejando `context` líneas alrededor de cada cambio. */
export function foldDiff(lines: DiffLine[], context = 3): DiffItem[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((line, idx) => {
    if (line.type === 'same') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) keep[k] = true;
  });

  const out: DiffItem[] = [];
  let hidden = 0;
  lines.forEach((line, idx) => {
    if (keep[idx]) {
      if (hidden) out.push({ type: 'fold', count: hidden });
      hidden = 0;
      out.push(line);
    } else {
      hidden++;
    }
  });
  if (hidden) out.push({ type: 'fold', count: hidden });
  return out;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.type === 'add') added++;
    else if (l.type === 'del') removed++;
  }
  return { added, removed };
}
