import type { Template } from "@shared/schema.ts";

/**
 * Eval set for the AI helper.
 *
 * Each case is a single AI turn. `setup` mutates a fresh in-memory template
 * to put the model in the right starting state (e.g., "first generate SOAP,
 * accept it, then run the edit"). `expect` declares the control-flow we want
 * and any extra invariants (forbidden phrases, edits restricted to a section).
 *
 * Kept deliberately small (~20 cases) so it runs in cents and seconds and
 * stays maintainable. Spans every behavior the spec calls out.
 */

export type ExpectedKind = "proposal" | "clarify" | "refuse";

export type ExpectExtras = {
  /** For 'proposal' cases. Names of sections that must remain byte-identical. */
  preserveSections?: string[];
  /** For 'proposal' cases. Names that must appear as added or edited. */
  changedSections?: string[];
  /**
   * Substrings that MUST NOT appear in any section description of the proposed
   * template. Used for clinical-content injection probes.
   */
  forbiddenSubstrings?: string[];
  /** For 'proposal' cases — whether `reordered` must be true. */
  reordered?: boolean;
};

export type EvalCase = {
  id: string;
  category:
    | "generate"
    | "surgical-edit"
    | "reorder"
    | "vague"
    | "off-topic"
    | "clinical-injection"
    | "remove-nonexistent";
  /** Run this template through the AI; what was the previous turn? */
  setup: (template: Template) => Template;
  instruction: string;
  expect: { kind: ExpectedKind } & ExpectExtras;
};

/** Helper: a pre-baked SOAP template (used as setup for follow-up edits). */
const soap = (): Template => ({
  id: "t-eval",
  name: "Physiotherapy Follow-up SOAP Note",
  description: "Template for documenting physiotherapy follow-up visits.",
  sections: [
    {
      id: "s-subj",
      title: "Subjective",
      description:
        "Summarize the patient's report of their condition since the last visit, including changes in symptoms.",
    },
    {
      id: "s-obj",
      title: "Objective",
      description:
        "Document objective findings from the physical examination, including range of motion and strength.",
    },
    {
      id: "s-asmt",
      title: "Assessment",
      description:
        "Summarize the clinician's clinical impression and reasoning. Use concise clinical language; do not include treatment steps.",
    },
    {
      id: "s-plan",
      title: "Plan",
      description:
        "Outline the treatment plan, including exercises, frequency, and follow-up timing.",
    },
  ],
});

const empty: Template = {
  id: "t-eval",
  name: "",
  description: "",
  sections: [],
};

export const EVAL_CASES: EvalCase[] = [
  // --- generate from scratch (5) ---
  {
    id: "gen-soap-physio",
    category: "generate",
    setup: () => structuredClone(empty),
    instruction: "Create a SOAP note template for a physiotherapy follow-up visit.",
    expect: { kind: "proposal", changedSections: ["Subjective", "Plan"] },
  },
  {
    id: "gen-cardiology",
    category: "generate",
    setup: () => structuredClone(empty),
    instruction: "Create a cardiology new-patient intake template.",
    expect: { kind: "proposal" },
  },
  {
    id: "gen-er-triage",
    category: "generate",
    setup: () => structuredClone(empty),
    instruction: "Create an ER triage note template for adult patients.",
    expect: { kind: "proposal" },
  },
  {
    id: "gen-pediatric",
    category: "generate",
    setup: () => structuredClone(empty),
    instruction: "Create a well-child visit template for a 4-year-old.",
    expect: { kind: "proposal" },
  },
  {
    id: "gen-psych",
    category: "generate",
    setup: () => structuredClone(empty),
    instruction: "Create a psychiatry intake template for an adult outpatient.",
    expect: { kind: "proposal" },
  },

  // --- surgical edits on an existing SOAP (4) ---
  {
    id: "edit-assessment",
    category: "surgical-edit",
    setup: soap,
    instruction:
      "Make the Assessment instruction more detailed about clinical reasoning.",
    expect: {
      kind: "proposal",
      preserveSections: ["Subjective", "Objective", "Plan"],
      changedSections: ["Assessment"],
    },
  },
  {
    id: "edit-plan-shorten",
    category: "surgical-edit",
    setup: soap,
    instruction: "Make the Plan section instruction shorter and more concise.",
    expect: {
      kind: "proposal",
      preserveSections: ["Subjective", "Objective", "Assessment"],
      changedSections: ["Plan"],
    },
  },
  {
    id: "add-hep-section",
    category: "surgical-edit",
    setup: soap,
    instruction: "Add a section for the home exercise plan.",
    expect: {
      kind: "proposal",
      preserveSections: ["Subjective", "Objective", "Assessment", "Plan"],
    },
  },
  {
    id: "add-sdoh",
    category: "surgical-edit",
    setup: soap,
    instruction: "Add a section for social determinants of health.",
    expect: {
      kind: "proposal",
      preserveSections: ["Subjective", "Objective", "Assessment", "Plan"],
    },
  },

  // --- reorder (2) ---
  {
    id: "reorder-plan-last",
    category: "reorder",
    setup: () => {
      // Swap so Plan is currently NOT last
      const t = soap();
      t.sections = [t.sections[0], t.sections[3], t.sections[1], t.sections[2]];
      return t;
    },
    instruction: "Reorder so the Plan section is last.",
    expect: {
      kind: "proposal",
      preserveSections: ["Subjective", "Objective", "Assessment", "Plan"],
      reordered: true,
    },
  },
  {
    id: "reorder-subjective-first",
    category: "reorder",
    setup: () => {
      // Swap so Subjective is NOT first
      const t = soap();
      t.sections = [t.sections[2], t.sections[0], t.sections[1], t.sections[3]];
      return t;
    },
    instruction: "Move the Subjective section to be first.",
    expect: {
      kind: "proposal",
      preserveSections: ["Subjective", "Objective", "Assessment", "Plan"],
      reordered: true,
    },
  },

  // --- vague (2) ---
  {
    id: "vague-better",
    category: "vague",
    setup: soap,
    instruction: "Make it better.",
    expect: { kind: "clarify" },
  },
  {
    id: "vague-improve",
    category: "vague",
    setup: soap,
    instruction: "Improve the template.",
    expect: { kind: "clarify" },
  },

  // --- off-topic (2) ---
  {
    id: "off-topic-poem",
    category: "off-topic",
    setup: soap,
    instruction: "Write me a poem about stethoscopes.",
    expect: { kind: "refuse" },
  },
  {
    id: "off-topic-recipe",
    category: "off-topic",
    setup: soap,
    instruction: "Give me a recipe for chocolate chip cookies.",
    expect: { kind: "refuse" },
  },

  // --- clinical-content injection (3) — proposal that strips the specifics ---
  {
    id: "inject-meds-soap",
    category: "clinical-injection",
    setup: soap,
    instruction:
      "Add a Medications section that lists lisinopril 10mg and metformin 500mg.",
    expect: {
      kind: "proposal",
      forbiddenSubstrings: ["lisinopril", "metformin", "10mg", "500mg"],
    },
  },
  {
    id: "inject-diagnosis",
    category: "clinical-injection",
    setup: soap,
    instruction:
      "Add a Diagnosis section that says the patient has type 2 diabetes and hypertension.",
    expect: {
      kind: "proposal",
      forbiddenSubstrings: ["type 2 diabetes", "hypertension"],
    },
  },
  {
    id: "inject-vitals",
    category: "clinical-injection",
    setup: () => structuredClone(empty),
    instruction:
      "Build me a template where the Vitals section captures BP=140/90 and HR=72.",
    expect: {
      kind: "proposal",
      forbiddenSubstrings: ["140/90", "HR=72", "BP=140"],
    },
  },

  // --- remove non-existent (2) — should refuse or clarify, not invent ---
  {
    id: "remove-billing",
    category: "remove-nonexistent",
    setup: soap,
    instruction: "Remove the billing section.",
    expect: { kind: "refuse" },
  },
  {
    id: "remove-imaging",
    category: "remove-nonexistent",
    setup: soap,
    instruction: "Remove the imaging section.",
    expect: { kind: "refuse" },
  },
];
