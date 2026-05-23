import { z } from "zod";

export const SectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, "Section title is required"),
  description: z.string(),
});

export const TemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Template name is required"),
  description: z.string().min(1, "Template description is required"),
  sections: z
    .array(SectionSchema)
    .min(1, "Template must have at least one section"),
});

export type Section = z.infer<typeof SectionSchema>;
export type Template = z.infer<typeof TemplateSchema>;

/**
 * The shape the model returns from the `propose_template` tool.
 *
 * IDs are optional because new sections won't have one yet; we reconcile
 * them on the server (preserving known IDs verbatim, fuzzy-matching by title
 * for unknown ones, assigning fresh IDs for genuinely new sections).
 *
 * Accepts `null`, `undefined`, or empty string for "no id" — OpenAI's strict
 * mode requires every key to be present, so the model returns `id: null` for
 * new sections rather than omitting the key.
 */
const ProposedSectionSchema = z.object({
  id: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null || v === "" ? undefined : v)),
  title: z.string().min(1, "Section title is required"),
  description: z.string().min(1, "Section description is required"),
});

export const ProposalSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  sections: z.array(ProposedSectionSchema).min(1),
  rationale: z.string().min(1),
  change_summary: z.array(z.string()).default([]),
});

export const ClarifySchema = z.object({
  question: z.string().min(1),
});

export const RefuseSchema = z.object({
  reason: z.string().min(1),
});

export type Proposal = z.infer<typeof ProposalSchema>;

/** A single diff entry produced after server-side reconciliation. */
export type DiffItem =
  | { kind: "added"; section: Section; position: number }
  | { kind: "removed"; section: Section; previousPosition: number }
  | {
      kind: "edited";
      before: Section;
      after: Section;
      titleChanged: boolean;
      descriptionChanged: boolean;
    }
  | { kind: "unchanged"; section: Section };

export type ResolvedProposal = {
  /** Proposed full template (not yet committed). */
  template: Template;
  /** Per-section diff vs current template (excluding reorder). */
  diff: DiffItem[];
  /** True if any unchanged/edited section's position changed. */
  reordered: boolean;
  metadataChanged: { name: boolean; description: boolean };
  rationale: string;
  changeSummary: string[];
};

/** Chat memory we send back to the model for follow-up turns. */
export type ChatTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export type AIResponse =
  | { kind: "proposal"; proposal: ResolvedProposal }
  | { kind: "clarify"; question: string }
  | { kind: "refuse"; reason: string }
  | { kind: "error"; message: string; retryable: boolean };

export const MAX_USER_INPUT_LENGTH = 4000;

/** Persisted chat-panel message shape (client + server agree on this). */
export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      kind: "proposal";
      proposal: ResolvedProposal;
      status: "pending" | "accepted" | "rejected";
    }
  | { id: string; role: "assistant"; kind: "clarify"; question: string }
  | { id: string; role: "assistant"; kind: "refuse"; reason: string }
  | {
      id: string;
      role: "assistant";
      kind: "error";
      message: string;
      retryable: boolean;
    };
