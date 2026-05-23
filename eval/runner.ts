import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { propose } from "../server/src/llm/propose.ts";
import { EVAL_CASES } from "./prompts.ts";
import { aggregate, scoreCase, type CaseResult } from "./score.ts";
import { renderConsoleSummary, renderMarkdownSummary } from "./report.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Drive every eval case through the same `propose()` the server uses, score
 * each, then write JSON + a markdown summary into eval/results/. Prints a
 * one-screen summary to stdout.
 *
 * Run: `npm run eval`
 */
async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY missing. Add it to .env and re-run.");
    process.exit(1);
  }

  const results: CaseResult[] = [];
  const t0 = Date.now();

  for (const c of EVAL_CASES) {
    process.stdout.write(`▸ ${c.id} `.padEnd(40));
    const template = c.setup({
      id: "t-eval",
      name: "",
      description: "",
      sections: [],
    });
    const response = await propose({
      userMessage: c.instruction,
      currentTemplate: template,
      chatHistory: [],
    });
    const result = scoreCase(c, template, response);
    results.push(result);
    const tag = result.kindMatch ? "✓" : "✗";
    const extras: string[] = [];
    if (result.noClinicalLeak === false) extras.push("LEAK");
    if (
      result.editLocalization !== null &&
      result.editLocalization < 1
    )
      extras.push(`loc=${(result.editLocalization * 100).toFixed(0)}%`);
    if (result.reorderFlagMatch === false) extras.push("reorder?");
    console.log(
      `${tag} kind=${result.actualKind}${extras.length ? "  [" + extras.join(", ") + "]" : ""}`,
    );
  }

  const agg = aggregate(results);

  console.log();
  console.log(renderConsoleSummary(agg));
  console.log();
  console.log(`Total wall time: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const outDir = path.join(__dirname, "results");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `${stamp}.json`);
  const mdPath = path.join(outDir, `${stamp}.md`);
  await writeFile(
    jsonPath,
    JSON.stringify({ aggregate: agg, results }, null, 2),
  );
  await writeFile(mdPath, renderMarkdownSummary(agg, results));
  console.log();
  console.log(`Wrote ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`Wrote ${path.relative(process.cwd(), mdPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
