import { diffWordsWithSpace, type Change } from "diff";

export type DiffPart =
  | { kind: "same"; text: string }
  | { kind: "add"; text: string }
  | { kind: "del"; text: string };

/**
 * Word-level diff between two strings, preserving whitespace.
 * Empty input on either side returns a single segment of the other.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  if (before === after) return [{ kind: "same", text: after }];
  const changes = diffWordsWithSpace(before, after);
  return changes.map(toPart);
}

function toPart(c: Change): DiffPart {
  if (c.added) return { kind: "add", text: c.value };
  if (c.removed) return { kind: "del", text: c.value };
  return { kind: "same", text: c.value };
}

/**
 * Inline word-diff stops being useful when most of the text has changed —
 * the result looks like a wall of struck-through and inserted phrases.
 * Above this threshold, the UI falls back to the two-block before/after view.
 *
 * Threshold tuned so a single-phrase edit (~10% changed) renders inline, and
 * a full rewrite (~80% changed) falls back. Measured by character count, not
 * word count, so a small change to a long sentence still renders inline.
 */
export const HEAVY_CHANGE_RATIO = 0.6;

export function changeRatio(parts: DiffPart[]): number {
  let changed = 0;
  let total = 0;
  for (const p of parts) {
    const len = p.text.length;
    total += len;
    if (p.kind !== "same") changed += len;
  }
  return total === 0 ? 0 : changed / total;
}

export function isHeavyChange(parts: DiffPart[]): boolean {
  return changeRatio(parts) > HEAVY_CHANGE_RATIO;
}
