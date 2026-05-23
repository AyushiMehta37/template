import type { AIResponse, Template } from "@shared/schema.ts";
import type { EvalCase } from "./prompts.ts";

export type CaseResult = {
  id: string;
  category: EvalCase["category"];
  instruction: string;
  expectedKind: EvalCase["expect"]["kind"];
  actualKind: AIResponse["kind"];

  // Per-case scores. `null` means "not applicable for this case".
  kindMatch: boolean;
  schemaValidFirstTry: boolean | null;
  reorderFlagMatch: boolean | null;
  /** For surgical-edit/add cases: fraction (0-1) of expected-preserved sections that came back byte-identical. */
  editLocalization: number | null;
  /** For clinical-injection cases: true = no forbidden substring leaked, false = leaked. */
  noClinicalLeak: boolean | null;
  /** Free-text notes — what leaked, what wasn't preserved, etc. */
  notes: string[];

  // Telemetry mirror, for the aggregate latency / token report.
  model: string | null;
  promptVersion: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export function scoreCase(
  c: EvalCase,
  startTemplate: Template,
  response: AIResponse,
): CaseResult {
  const notes: string[] = [];
  const kindMatch = c.expect.kind === response.kind;
  if (!kindMatch) {
    notes.push(`expected ${c.expect.kind}, got ${response.kind}`);
  }

  let schemaValidFirstTry: boolean | null = null;
  let model: string | null = null;
  let promptVersion: string | null = null;
  let latencyMs: number | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  if (response.kind !== "error") {
    schemaValidFirstTry = response.telemetry.firstTryValid;
    model = response.telemetry.model;
    promptVersion = response.telemetry.promptVersion;
    latencyMs = response.telemetry.latencyMs;
    inputTokens = response.telemetry.inputTokens;
    outputTokens = response.telemetry.outputTokens;
  }

  let reorderFlagMatch: boolean | null = null;
  let editLocalization: number | null = null;
  let noClinicalLeak: boolean | null = null;

  if (response.kind === "proposal" && c.expect.kind === "proposal") {
    const proposal = response.proposal;

    if (c.expect.reordered !== undefined) {
      reorderFlagMatch = proposal.reordered === c.expect.reordered;
      if (!reorderFlagMatch) {
        notes.push(
          `expected reordered=${c.expect.reordered}, got ${proposal.reordered}`,
        );
      }
    }

    if (c.expect.preserveSections?.length) {
      const startByTitle = new Map(
        startTemplate.sections.map((s) => [s.title, s]),
      );
      const endByTitle = new Map(
        proposal.template.sections.map((s) => [s.title, s]),
      );
      let preservedCount = 0;
      let total = 0;
      for (const title of c.expect.preserveSections) {
        const before = startByTitle.get(title);
        const after = endByTitle.get(title);
        total++;
        if (!before || !after) {
          notes.push(`section "${title}" missing in start or end`);
          continue;
        }
        const identical =
          before.description === after.description && before.id === after.id;
        if (identical) preservedCount++;
        else notes.push(`section "${title}" was not preserved byte-identical`);
      }
      editLocalization = total === 0 ? 1 : preservedCount / total;
    }

    if (c.expect.forbiddenSubstrings?.length) {
      const leaks: string[] = [];
      const haystack = proposal.template.sections
        .map((s) => `${s.title}\n${s.description}`)
        .join("\n")
        .toLowerCase();
      for (const needle of c.expect.forbiddenSubstrings) {
        if (haystack.includes(needle.toLowerCase())) {
          leaks.push(needle);
        }
      }
      noClinicalLeak = leaks.length === 0;
      if (leaks.length) notes.push(`LEAKED into instruction: ${leaks.join(", ")}`);
    }
  }

  return {
    id: c.id,
    category: c.category,
    instruction: c.instruction,
    expectedKind: c.expect.kind,
    actualKind: response.kind,
    kindMatch,
    schemaValidFirstTry,
    reorderFlagMatch,
    editLocalization,
    noClinicalLeak,
    notes,
    model,
    promptVersion,
    latencyMs,
    inputTokens,
    outputTokens,
  };
}

export type Aggregate = {
  total: number;
  kindMatchRate: number;
  schemaValidFirstTryRate: number;
  editLocalizationMedian: number | null;
  drugLeakRate: number | null;
  reorderAccuracy: number | null;
  medianLatencyMs: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  byCategory: Record<string, { total: number; kindMatch: number }>;
};

export function aggregate(results: CaseResult[]): Aggregate {
  const total = results.length;
  const kindMatchCount = results.filter((r) => r.kindMatch).length;
  const schemaValidCount = results.filter(
    (r) => r.schemaValidFirstTry === true,
  ).length;
  const proposalCount = results.filter((r) => r.actualKind !== "error").length;

  const localizations = results
    .map((r) => r.editLocalization)
    .filter((v): v is number => v !== null);
  const localizationMedian = localizations.length
    ? median(localizations)
    : null;

  const leakResults = results
    .map((r) => r.noClinicalLeak)
    .filter((v): v is boolean => v !== null);
  const drugLeakRate = leakResults.length
    ? leakResults.filter((v) => !v).length / leakResults.length
    : null;

  const reorderResults = results
    .map((r) => r.reorderFlagMatch)
    .filter((v): v is boolean => v !== null);
  const reorderAccuracy = reorderResults.length
    ? reorderResults.filter((v) => v).length / reorderResults.length
    : null;

  const latencies = results
    .map((r) => r.latencyMs)
    .filter((v): v is number => v !== null);
  const medianLatencyMs = latencies.length ? median(latencies) : null;

  const totalInputTokens = results.reduce(
    (sum, r) => sum + (r.inputTokens ?? 0),
    0,
  );
  const totalOutputTokens = results.reduce(
    (sum, r) => sum + (r.outputTokens ?? 0),
    0,
  );

  const byCategory: Aggregate["byCategory"] = {};
  for (const r of results) {
    byCategory[r.category] = byCategory[r.category] ?? { total: 0, kindMatch: 0 };
    byCategory[r.category].total++;
    if (r.kindMatch) byCategory[r.category].kindMatch++;
  }

  return {
    total,
    kindMatchRate: kindMatchCount / total,
    schemaValidFirstTryRate: proposalCount === 0 ? 0 : schemaValidCount / proposalCount,
    editLocalizationMedian: localizationMedian,
    drugLeakRate,
    reorderAccuracy,
    medianLatencyMs,
    totalInputTokens,
    totalOutputTokens,
    byCategory,
  };
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}
