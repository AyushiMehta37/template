import { describe, expect, it } from "vitest";
import type { Proposal, Template } from "@shared/schema.ts";
import {
  detectReorder,
  resolveProposal,
  titleSimilarity,
} from "../src/template/diff.ts";

function tpl(
  sections: Array<{ id: string; title: string; description: string }>,
): Template {
  return {
    id: "T1",
    name: "Test",
    description: "Test template",
    sections,
  };
}

function proposal(
  partial: Partial<Proposal> & Pick<Proposal, "sections">,
): Proposal {
  return {
    name: partial.name ?? "Test",
    description: partial.description ?? "Test template",
    rationale: partial.rationale ?? "rationale",
    change_summary: partial.change_summary ?? [],
    sections: partial.sections,
  };
}

describe("resolveProposal", () => {
  it("treats all sections as added when current template is empty", () => {
    const current = tpl([]);
    const out = resolveProposal(
      current,
      proposal({
        sections: [
          { title: "Subjective", description: "Capture chief complaint." },
          { title: "Objective", description: "Vital signs and exam." },
        ],
      }),
    );
    expect(out.diff).toHaveLength(2);
    expect(out.diff.every((d) => d.kind === "added")).toBe(true);
    expect(out.reordered).toBe(false);
    // New sections get freshly-minted UUIDs
    expect(out.template.sections[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("preserves ids verbatim for unchanged sections", () => {
    const current = tpl([
      { id: "s1", title: "Subjective", description: "x" },
      { id: "s2", title: "Objective", description: "y" },
    ]);
    const out = resolveProposal(
      current,
      proposal({
        sections: [
          { id: "s1", title: "Subjective", description: "x" },
          { id: "s2", title: "Objective", description: "y" },
        ],
      }),
    );
    expect(out.diff.every((d) => d.kind === "unchanged")).toBe(true);
    expect(out.template.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("detects a single edited section while leaving others untouched", () => {
    const current = tpl([
      { id: "s1", title: "Subjective", description: "old" },
      { id: "s2", title: "Objective", description: "y" },
    ]);
    const out = resolveProposal(
      current,
      proposal({
        sections: [
          { id: "s1", title: "Subjective", description: "NEW description" },
          { id: "s2", title: "Objective", description: "y" },
        ],
      }),
    );
    const edited = out.diff.filter((d) => d.kind === "edited");
    const unchanged = out.diff.filter((d) => d.kind === "unchanged");
    expect(edited).toHaveLength(1);
    expect(unchanged).toHaveLength(1);
    if (edited[0].kind === "edited") {
      expect(edited[0].descriptionChanged).toBe(true);
      expect(edited[0].titleChanged).toBe(false);
    }
  });

  it("detects pure reorder without content changes", () => {
    const current = tpl([
      { id: "s1", title: "A", description: "a" },
      { id: "s2", title: "B", description: "b" },
      { id: "s3", title: "C", description: "c" },
    ]);
    const out = resolveProposal(
      current,
      proposal({
        sections: [
          { id: "s3", title: "C", description: "c" },
          { id: "s1", title: "A", description: "a" },
          { id: "s2", title: "B", description: "b" },
        ],
      }),
    );
    expect(out.reordered).toBe(true);
    expect(out.diff.every((d) => d.kind === "unchanged")).toBe(true);
  });

  it("flags removed sections", () => {
    const current = tpl([
      { id: "s1", title: "Keep", description: "k" },
      { id: "s2", title: "Drop", description: "d" },
    ]);
    const out = resolveProposal(
      current,
      proposal({
        sections: [{ id: "s1", title: "Keep", description: "k" }],
      }),
    );
    expect(out.diff.filter((d) => d.kind === "removed")).toHaveLength(1);
    expect(out.diff.filter((d) => d.kind === "unchanged")).toHaveLength(1);
  });

  it("recovers from model dropping an id when title is similar (fallback)", () => {
    // Model returns the same section but forgot the id. Without fallback this
    // would show as removed + added — a fake catastrophic diff.
    const current = tpl([
      { id: "s1", title: "Assessment", description: "old" },
    ]);
    const out = resolveProposal(
      current,
      proposal({
        sections: [
          // no id, but title close enough — should match by similarity
          { title: "Assessment", description: "improved version" },
        ],
      }),
    );
    expect(out.diff).toHaveLength(1);
    expect(out.diff[0].kind).toBe("edited");
    expect(out.template.sections[0].id).toBe("s1");
  });

  it("recovers from model returning a hallucinated id when title matches", () => {
    const current = tpl([
      { id: "s1", title: "Plan", description: "p" },
    ]);
    const out = resolveProposal(
      current,
      proposal({
        sections: [{ id: "garbage-id", title: "Plan", description: "p" }],
      }),
    );
    expect(out.diff[0].kind).toBe("unchanged");
    expect(out.template.sections[0].id).toBe("s1");
  });

  it("treats a genuinely new section as added (no fallback match)", () => {
    const current = tpl([
      { id: "s1", title: "Subjective", description: "x" },
    ]);
    const out = resolveProposal(
      current,
      proposal({
        sections: [
          { id: "s1", title: "Subjective", description: "x" },
          { title: "Home Exercise Plan", description: "instructions for HEP" },
        ],
      }),
    );
    expect(out.diff.filter((d) => d.kind === "added")).toHaveLength(1);
    expect(out.diff.filter((d) => d.kind === "unchanged")).toHaveLength(1);
  });

  it("does not double-claim a current section when two proposed sections have similar titles", () => {
    const current = tpl([
      { id: "s1", title: "Assessment", description: "x" },
    ]);
    const out = resolveProposal(
      current,
      proposal({
        sections: [
          { title: "Assessment", description: "first" },
          { title: "Assessment", description: "second" },
        ],
      }),
    );
    // Only one can match by fallback; the other must be treated as added.
    const matchedIds = out.template.sections.map((s) => s.id);
    expect(matchedIds).toContain("s1");
    expect(new Set(matchedIds).size).toBe(2); // both unique
  });

  it("flags metadata changes", () => {
    const current = tpl([{ id: "s1", title: "X", description: "x" }]);
    const out = resolveProposal(current, {
      name: "New Name",
      description: "New description",
      sections: [{ id: "s1", title: "X", description: "x" }],
      rationale: "...",
      change_summary: [],
    });
    expect(out.metadataChanged).toEqual({ name: true, description: true });
  });
});

describe("detectReorder", () => {
  it("returns false when no shared sections move", () => {
    expect(
      detectReorder(
        [
          { id: "a", title: "A", description: "" },
          { id: "b", title: "B", description: "" },
        ],
        [
          { id: "a", title: "A", description: "" },
          { id: "b", title: "B", description: "" },
          { id: "c", title: "C", description: "" },
        ],
      ),
    ).toBe(false);
  });

  it("returns true when shared sections swap order", () => {
    expect(
      detectReorder(
        [
          { id: "a", title: "A", description: "" },
          { id: "b", title: "B", description: "" },
        ],
        [
          { id: "b", title: "B", description: "" },
          { id: "a", title: "A", description: "" },
        ],
      ),
    ).toBe(true);
  });
});

describe("titleSimilarity", () => {
  it("returns 1 for identical strings (case- and space-insensitive)", () => {
    expect(titleSimilarity("Assessment", "  assessment  ")).toBe(1);
  });
  it("returns a high score for close strings (minor edits / typos)", () => {
    // Realistic model drift: extra punctuation, casing, a single-letter typo.
    expect(titleSimilarity("Assessment", "assessment.")).toBeGreaterThan(0.7);
    expect(titleSimilarity("Home Exercise Plan", "Home Excercise Plan")).toBeGreaterThan(
      0.7,
    );
  });
  it("returns a low score for unrelated strings", () => {
    expect(titleSimilarity("Assessment", "Billing")).toBeLessThan(0.5);
  });
});
