# Vocanote — Template Builder

Mini-app for the Vocanote AI Engineer take-home: a clinician builds and refines a clinical-note template by talking to an AI helper. A template is an ordered list of sections, where each section's *description* is a writing instruction to a downstream summarizer LLM — it tells the summarizer what to write in that section, not what the clinical content is.

## Run

Node 20+.

```bash
npm install
cp .env.example .env       # set OPENAI_API_KEY=sk-...
npm run dev                # server :3001, client :5173
```

Open http://localhost:5173. Try *"Create a SOAP note template for a physiotherapy follow-up visit."* then iteratively edit.

```bash
npm test          # 4 vitest suites, 39 tests
npm run typecheck
npm run eval      # runs the 20-prompt eval harness against the live model
```

See [PROMPT_NOTES.md](PROMPT_NOTES.md) for the prompt iteration log (v1 → v4) — each version, the failure that drove the change, the eval delta where available. Eval reports land in [eval/results/](eval/results/) as JSON + Markdown per run.

## Design decisions

- **Propose-diff-then-accept.** AI never silently mutates the template. Each turn produces a proposed template; the UI shows an inline word-level diff + rationale; the clinician clicks Accept or Reject. One extra click is the right tradeoff because the doctor must remain the author.

- **Single tool + server-side diff.** One `propose_template` tool returns the *full new template*; the server diffs it against the current state, preserving section IDs. Two control-flow tools, `clarify` and `refuse`, handle vague and off-topic requests. `tool_choice: "required"` + `strict: true` on every tool means OpenAI guarantees the JSON shape — Zod in [shared/schema.ts](shared/schema.ts) is defense-in-depth for value constraints. On Zod failure, [propose.ts](server/src/llm/propose.ts) does **one retry** feeding the error back as a `role: "tool"` message, then surfaces a clean error.

  I considered fine-grained operation tools (`add_section`, `update_section`, …). Rejected: more schemas, more failure modes, no UX gain. "Surgical edits" is a *diff-view* concern, not a wire-format concern.

- **Current state as ground truth.** Every turn re-injects the current template into the user message as XML. Chat history (bounded to 6 turns) carries *intent*; the template carries *facts*. Enables follow-ups like "now reorder them" without history drift.

- **ID preservation is layered.** Without protection, a small edit looks like remove+re-add of every section. Mitigations: (1) the system prompt requires the model to copy IDs verbatim for kept sections, (2) [diff.ts](server/src/template/diff.ts) falls back to normalized-Levenshtein title similarity when IDs are dropped or hallucinated, (3) [diff.test.ts](server/test/diff.test.ts) locks both paths down.

- **Healthcare judgment.** The system prompt forbids inventing patient-specific clinical content in section instructions, and includes a worked example for the "Add a Medications section listing X 10mg" case: propose the section with a generalised capture instruction, don't refuse.

- **Edge cases** — empty input → 400; >4k chars → 413; vague → `clarify`; off-topic → `refuse`; invalid model output twice → retryable chat error; network error → caught and surfaced.

## What I deliberately cut

Drag-reorder UI, undo/redo, streaming, multi-template management, persistence, auth, visual polish beyond Tailwind defaults. The spec is explicit about all of these — in-memory is fine, "simple working form" is fine, the AI helper is the focus.

## What I'd do with more time

Streaming, versioned snapshots with one-click revert, drag reorder, the eval harness wired into PR checks (currently runnable but not gated), a per-session token budget, multi-turn eval cases.

---

## How I'd measure whether this AI helper is actually good

Five layers, automated for fast feedback during prompt work, human for what can't be automated:

1. **Output validity rate** — % of turns whose tool call passes Zod on the *first* try, over a fixed 50-prompt golden set. Strict mode keeps this very high; the retry path keeps user-facing failures lower still, but first-try validity is the real signal of prompt quality.
2. **Refuse / clarify precision-recall** — hand-labelled ~20-prompt mixed set (template requests, vague, off-topic, clinical-content-injection). Catches both an over-eager AI and a paranoid one.
3. **Edit localization** — when the user asks to change one section, % of *other* sections that come back byte-identical (or only ID-preserved via fallback). Median across a 30-prompt edit set. Catches silent over-regeneration.
4. **Section-instruction quality rubric** — two raters score 1-5 on (a) clarity of what to write, (b) clarity of what to exclude, (c) imperative voice, (d) no invented clinical content, (e) specialty appropriateness. Inter-rater agreement reported. ~30 templates spanning specialties. The hardest-to-game metric, weighted most.
5. **Cost & latency** — p50/p95 turn latency, tokens/turn, retry rate. Retry rate is a leading indicator of prompt drift.

**Regression catching**: snapshot the system prompt (done — [prompt-snapshot.test.ts](server/test/prompt-snapshot.test.ts)), pin the model version, re-run the eval on every prompt change, fail PRs that drop any metric past a threshold.

**Eval set seed**: ACI-Bench (Yim et al., 2023) and MTS-Dialog for realistic note structures and specialty taxonomies — used to write ground-truth expected templates, not to train anything.
