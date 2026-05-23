import type OpenAI from "openai";

/**
 * Tool schemas for OpenAI's function-calling API, used with `strict: true`.
 *
 * Strict-mode requirements we comply with:
 *   - every object schema has `additionalProperties: false`
 *   - every property in `properties` is listed in `required`
 *   - optional fields (like a proposed section's `id`) are expressed as a
 *     nullable type — required key, but `type: ["string", "null"]`
 *
 * These schemas stay aligned with the Zod schemas in shared/schema.ts.
 * The Zod schemas are the runtime ground truth; the JSON Schema below is
 * what we send to the model. validate.test.ts catches drift between the two.
 */

export const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "propose_template",
      description:
        "Propose a complete new template (name, description, ordered sections). Use this for both from-scratch generation and modifications. For any section you are keeping or editing, copy its id verbatim from the current template. For new sections, set id to null. The system computes a diff against the current state.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            description: "Template name (1-80 chars).",
          },
          description: {
            type: "string",
            description:
              "1-3 sentence description of what this template is for and when it is used.",
          },
          sections: {
            type: "array",
            description:
              "Ordered list of sections. Order matters. Each section's description is an instruction to the downstream summarizer LLM, not patient content.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: {
                  type: ["string", "null"],
                  description:
                    "REQUIRED for sections from the current template (copy verbatim). For NEWLY CREATED sections, set to null. Do not invent a new id.",
                },
                title: { type: "string" },
                description: {
                  type: "string",
                  description:
                    "Imperative instruction to the downstream summarizer. Describes WHAT to write and WHAT TO EXCLUDE.",
                },
              },
              required: ["id", "title", "description"],
            },
          },
          rationale: {
            type: "string",
            description: "One sentence explaining the change.",
          },
          change_summary: {
            type: "array",
            description:
              "Human-readable bullets describing what changed vs the current template.",
            items: { type: "string" },
          },
        },
        required: ["name", "description", "sections", "rationale", "change_summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clarify",
      description:
        "Ask the clinician a single focused clarifying question when the request is too vague to act on safely.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "refuse",
      description:
        "Politely refuse a request that is not about authoring or refining a clinical-note template.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          reason: {
            type: "string",
            description:
              "Brief explanation in friendly tone, redirecting to template-authoring tasks.",
          },
        },
        required: ["reason"],
      },
    },
  },
];
