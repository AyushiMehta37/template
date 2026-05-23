import type { Aggregate, CaseResult } from "./score.ts";

export function renderMarkdownSummary(agg: Aggregate, results: CaseResult[]): string {
  const lines: string[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  lines.push(`# Eval results`);
  lines.push("");
  lines.push(`**Cases:** ${agg.total}`);
  lines.push(`**Kind-match rate (control flow correct):** ${pct(agg.kindMatchRate)}`);
  lines.push(
    `**Schema-valid on first try:** ${pct(agg.schemaValidFirstTryRate)} of non-error responses`,
  );
  if (agg.editLocalizationMedian !== null) {
    lines.push(
      `**Edit-localization median:** ${pct(agg.editLocalizationMedian)} of expected-preserved sections kept byte-identical`,
    );
  }
  if (agg.drugLeakRate !== null) {
    lines.push(
      `**Drug-leak rate (clinical injection):** ${pct(agg.drugLeakRate)} ${
        agg.drugLeakRate === 0 ? "(no forbidden strings in any instruction ✓)" : ""
      }`,
    );
  }
  if (agg.reorderAccuracy !== null) {
    lines.push(`**Reorder flag accuracy:** ${pct(agg.reorderAccuracy)}`);
  }
  if (agg.medianLatencyMs !== null) {
    lines.push(`**Median latency:** ${agg.medianLatencyMs} ms`);
  }
  lines.push(
    `**Total tokens:** ${agg.totalInputTokens} in / ${agg.totalOutputTokens} out`,
  );
  lines.push("");

  lines.push(`## By category`);
  lines.push("");
  lines.push(`| Category | Kind-match |`);
  lines.push(`|---|---|`);
  for (const [cat, v] of Object.entries(agg.byCategory)) {
    lines.push(`| ${cat} | ${v.kindMatch}/${v.total} |`);
  }
  lines.push("");

  const failures = results.filter(
    (r) => !r.kindMatch || (r.editLocalization !== null && r.editLocalization < 1) || r.noClinicalLeak === false || r.reorderFlagMatch === false,
  );
  if (failures.length) {
    lines.push(`## Failures / issues (${failures.length})`);
    lines.push("");
    for (const r of failures) {
      lines.push(`- **${r.id}** (${r.category}) — ${r.notes.join("; ")}`);
    }
    lines.push("");
  } else {
    lines.push(`## Failures / issues`);
    lines.push("");
    lines.push(`None.`);
    lines.push("");
  }

  return lines.join("\n");
}

export function renderConsoleSummary(agg: Aggregate): string {
  const lines: string[] = [];
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  lines.push(`════════════════════════════════════════`);
  lines.push(`  EVAL RESULTS`);
  lines.push(`════════════════════════════════════════`);
  lines.push(`Cases:                  ${agg.total}`);
  lines.push(`Kind-match:             ${pct(agg.kindMatchRate)}`);
  lines.push(`Schema-valid first try: ${pct(agg.schemaValidFirstTryRate)}`);
  if (agg.editLocalizationMedian !== null) {
    lines.push(`Edit localization:      ${pct(agg.editLocalizationMedian)} (median)`);
  }
  if (agg.drugLeakRate !== null) {
    lines.push(
      `Drug-leak rate:         ${pct(agg.drugLeakRate)}${agg.drugLeakRate === 0 ? "  ✓" : "  ⚠"}`,
    );
  }
  if (agg.reorderAccuracy !== null) {
    lines.push(`Reorder accuracy:       ${pct(agg.reorderAccuracy)}`);
  }
  if (agg.medianLatencyMs !== null) {
    lines.push(`Median latency:         ${agg.medianLatencyMs} ms`);
  }
  lines.push(
    `Tokens:                 ${agg.totalInputTokens} in / ${agg.totalOutputTokens} out`,
  );
  lines.push(``);
  lines.push(`By category:`);
  for (const [cat, v] of Object.entries(agg.byCategory)) {
    lines.push(`  ${cat.padEnd(22)} ${v.kindMatch}/${v.total}`);
  }
  return lines.join("\n");
}
