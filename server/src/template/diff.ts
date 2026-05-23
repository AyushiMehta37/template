import { randomUUID } from "node:crypto";
import type {
  DiffItem,
  Proposal,
  ResolvedProposal,
  Section,
  Template,
} from "@shared/schema.ts";

/**
 * Take the model's proposal and reconcile it against the current template:
 *
 *   1. For each proposed section, find its identity in the current template by:
 *      a. exact id match (the happy path; preserved verbatim per system prompt)
 *      b. fuzzy title-similarity fallback (catches the model silently dropping or
 *         renaming an id on a section it intended to keep — without this, a
 *         one-section edit can look like a complete rewrite)
 *      c. otherwise: treat as a newly added section, mint a fresh id
 *
 *   2. Produce a per-section diff (added / removed / edited / unchanged) and a
 *      separate `reordered` flag (position changes don't show up as content edits).
 *
 *   3. Build the final ResolvedProposal with the new template embedding the
 *      reconciled ids, so accepting it just replaces the current state.
 */

const TITLE_SIMILARITY_THRESHOLD = 0.7;

export function resolveProposal(
  current: Template,
  proposal: Proposal,
): ResolvedProposal {
  const claimedCurrentIds = new Set<string>();
  const reconciled: Section[] = [];

  for (const proposed of proposal.sections) {
    const match = matchSection(
      proposed,
      current.sections,
      claimedCurrentIds,
    );
    if (match) {
      claimedCurrentIds.add(match.id);
      reconciled.push({
        id: match.id,
        title: proposed.title,
        description: proposed.description,
      });
    } else {
      reconciled.push({
        id: randomUUID(),
        title: proposed.title,
        description: proposed.description,
      });
    }
  }

  const newTemplate: Template = {
    id: current.id,
    name: proposal.name,
    description: proposal.description,
    sections: reconciled,
  };

  const currentById = new Map(current.sections.map((s) => [s.id, s]));
  const diff: DiffItem[] = [];

  for (let i = 0; i < reconciled.length; i++) {
    const after = reconciled[i];
    const before = currentById.get(after.id);
    if (!before) {
      diff.push({ kind: "added", section: after, position: i });
      continue;
    }
    const titleChanged = before.title !== after.title;
    const descriptionChanged = before.description !== after.description;
    if (titleChanged || descriptionChanged) {
      diff.push({
        kind: "edited",
        before,
        after,
        titleChanged,
        descriptionChanged,
      });
    } else {
      diff.push({ kind: "unchanged", section: after });
    }
  }

  for (let i = 0; i < current.sections.length; i++) {
    const s = current.sections[i];
    if (!claimedCurrentIds.has(s.id)) {
      diff.push({ kind: "removed", section: s, previousPosition: i });
    }
  }

  const reordered = detectReorder(current.sections, reconciled);

  return {
    template: newTemplate,
    diff,
    reordered,
    metadataChanged: {
      name: current.name !== newTemplate.name,
      description: current.description !== newTemplate.description,
    },
    rationale: proposal.rationale,
    changeSummary: proposal.change_summary,
  };
}

function matchSection(
  proposed: { id?: string; title: string },
  currentSections: Section[],
  alreadyClaimed: Set<string>,
): Section | null {
  if (proposed.id) {
    const exact = currentSections.find(
      (s) => s.id === proposed.id && !alreadyClaimed.has(s.id),
    );
    if (exact) return exact;
  }

  // Title-similarity fallback: catches the model dropping or hallucinating
  // an id on a section it meant to keep. We require a high similarity score
  // and pick the unclaimed candidate with the best match.
  let best: { section: Section; score: number } | null = null;
  for (const candidate of currentSections) {
    if (alreadyClaimed.has(candidate.id)) continue;
    const score = titleSimilarity(proposed.title, candidate.title);
    if (score >= TITLE_SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { section: candidate, score };
    }
  }
  return best?.section ?? null;
}

/**
 * Detects whether any pair of sections that exist in both before and after
 * has had its relative order changed. Pure adds/removes don't count as a
 * reorder. Returns true only if at least one shared section moved.
 */
export function detectReorder(before: Section[], after: Section[]): boolean {
  const beforeIds = new Set(before.map((s) => s.id));
  const sharedAfter = after.filter((s) => beforeIds.has(s.id)).map((s) => s.id);
  const afterIds = new Set(sharedAfter);
  const sharedBefore = before.filter((s) => afterIds.has(s.id)).map((s) => s.id);
  if (sharedBefore.length !== sharedAfter.length) return false;
  for (let i = 0; i < sharedBefore.length; i++) {
    if (sharedBefore[i] !== sharedAfter[i]) return true;
  }
  return false;
}

/** Normalized Levenshtein on lowercased, whitespace-collapsed titles. */
export function titleSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  let curr = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}
