# Vocanote — Template Builder

Mini-app for the Vocanote AI Engineer take-home: a clinician builds and refines a clinical-note template by talking to an AI helper. A template is an ordered list of sections, where each section's *description* is a writing instruction to a downstream summarizer LLM — not patient content itself.

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

See [PROMPT_NOTES.md](PROMPT_NOTES.md) for the prompt iteration log (v1 → v4) and [eval/results/](eval/results/) for the runs that drove it.

## Design decisions

- **Propose-diff-then-accept.** AI never silently mutates the template. Each turn produces a proposed template; the UI shows an inline word-level diff + rationale; the clinician clicks Accept or Reject. One extra click is the right tradeoff because the doctor must remain the author.

- **Single tool + server-side diff.** One `propose_template` tool returns the full new template; the server diffs it against the current state, preserving section IDs. Two control-flow tools, `clarify` and `refuse`, handle vague and off-topic requests. Every tool is registered with OpenAI `strict: true`, so the model can't return malformed JSON — Zod in [shared/schema.ts](shared/schema.ts) is defense-in-depth for value constraints (non-empty title, etc.). On Zod failure, [propose.ts](server/src/llm/propose.ts) does **one retry** feeding the error back as a `role: "tool"` message, then surfaces a clean error. Discrete-operation tools (`add_section`, `update_section`, …) were rejected: more schemas, more failure modes, no UX gain — "surgical edits" is a diff-view concern, not a wire-format concern.

- **Current state as ground truth.** Every turn re-injects the current template into the user message as XML. Chat history (bounded to 6 turns) carries *intent*; the template carries *facts*. Enables follow-ups like "now reorder them" without history drift.

- **ID preservation is layered.** Without protection, a small edit looks like remove+re-add of every section. Mitigations: (1) the system prompt requires the model to copy IDs verbatim for kept sections, (2) [diff.ts](server/src/template/diff.ts) falls back to normalized-Levenshtein title similarity when IDs are dropped or hallucinated, (3) [diff.test.ts](server/test/diff.test.ts) locks both paths down.

- **Healthcare judgment.** The system prompt forbids inventing patient-specific clinical content — drugs, dosages, diagnoses, vital-sign values, lab values — in section instructions. Includes two worked examples (Medications, Vitals) showing the correct response: propose the section with a generalised capture instruction, never echo the specifics back. Eval-driven; see PROMPT_NOTES.md.

- **Edge cases** — empty input → 400; >4k chars → 413; vague → `clarify`; off-topic → `refuse`; invalid model output twice → retryable chat error; network error → caught and surfaced.

## Cut / future

Drag-reorder UI, undo/redo, streaming, multi-template management, persistence, auth, visual polish beyond Tailwind defaults — all explicitly out of scope per the spec. With more time: streaming, versioned snapshots with one-click revert, drag reorder, the eval harness wired into CI as a PR gate, multi-turn eval cases, a per-session token budget.

---

## How I'd measure whether this AI helper is actually good

**Already implemented in [`npm run eval`](eval/runner.ts)** — 20 fixed cases drive the live model through the same `propose()` the server uses, with per-case scoring on:

1. **Tool routing** — proposal / clarify / refuse matches expectation. Current: 20/20.
2. **Schema validity first try** — strict mode + Zod, no retry fired. Current: 100%.
3. **Edit localization** — for surgical-edit cases, fraction of *other* sections that come back byte-identical. Current: median 100%.
4. **Clinical-leak rate** — for injection cases, presence of forbidden patient-specific strings in any section description. Current: 0/3.
5. **Latency, tokens** — per-turn and aggregate.

Results land in [`eval/results/`](eval/results/) as JSON + Markdown; PROMPT_NOTES.md cites them when iterating the prompt.

**Still future**: human rubric scoring for section-instruction quality (clarity, scope, imperative voice, specialty appropriateness) on ~30 templates with 2 raters; wiring the eval into a PR gate that fails on any metric regression; seeding a larger eval set from ACI-Bench (Yim et al., 2023) and MTS-Dialog for realistic specialty taxonomies.
