import type OpenAI from "openai";
import {
  ClarifySchema,
  ProposalSchema,
  RefuseSchema,
  type AIResponse,
  type ChatTurn,
  type Template,
} from "@shared/schema.ts";
import { resolveProposal } from "../template/diff.ts";
import { getModel, getOpenAI } from "./client.ts";
import { renderCurrentTemplate, SYSTEM_PROMPT } from "./prompt.ts";
import { TOOLS } from "./tools.ts";

export type LLMCall = (
  args: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
) => Promise<OpenAI.Chat.Completions.ChatCompletion>;

const defaultLLMCall: LLMCall = async (args) => {
  return getOpenAI().chat.completions.create(args);
};

export type ProposeInput = {
  userMessage: string;
  currentTemplate: Template;
  chatHistory: ChatTurn[];
  llmCall?: LLMCall;
  model?: string;
};

/**
 * Run one turn of the AI helper.
 *
 * Behavior:
 * - Always forces a tool call (propose_template | clarify | refuse) via
 *   `tool_choice: "required"` plus strict-mode function calling.
 * - Validates the tool input against Zod as defense-in-depth (strict mode
 *   guarantees the shape, but Zod also enforces value constraints like
 *   non-empty titles).
 * - On Zod failure: one retry, feeding the error back as a `role: "tool"`
 *   reply. After the second failure, surfaces a clean retryable error.
 * - On network / API errors: returns a retryable error response (never throws).
 */
export async function propose(input: ProposeInput): Promise<AIResponse> {
  const llmCall = input.llmCall ?? defaultLLMCall;
  const model = input.model ?? getModel();

  const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...input.chatHistory.map<OpenAI.Chat.Completions.ChatCompletionMessageParam>(
      (t) => ({ role: t.role, content: t.content }),
    ),
    {
      role: "user",
      content:
        `${renderCurrentTemplate(input.currentTemplate)}\n\n` +
        `<instruction>\n${input.userMessage.trim()}\n</instruction>\n\n` +
        `Respond by calling exactly one tool.`,
    },
  ];

  try {
    let response = await llmCall({
      model,
      messages: baseMessages,
      tools: TOOLS,
      tool_choice: "required",
    });

    let toolCall = findToolCall(response);
    if (!toolCall) {
      return retryableError(
        "The model did not return a tool call. Please try again.",
      );
    }

    let validated = validate(toolCall.function.name, parseArgs(toolCall.function.arguments));
    if (validated.kind === "error") {
      // Retry: feed the validation error back per OpenAI's tool-call protocol.
      const retryMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: null,
          tool_calls: [toolCall],
        },
        {
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Your previous tool input failed schema validation:\n${validated.message}\n\nFix the issues and call the tool again. Remember to preserve section IDs verbatim for kept sections (use null for newly created sections).`,
        },
      ];
      response = await llmCall({
        model,
        messages: retryMessages,
        tools: TOOLS,
        tool_choice: "required",
      });
      toolCall = findToolCall(response);
      if (!toolCall) {
        return retryableError(
          "The model failed twice to return a valid tool call. Please try again.",
        );
      }
      validated = validate(
        toolCall.function.name,
        parseArgs(toolCall.function.arguments),
      );
      if (validated.kind === "error") {
        return retryableError(
          `The model's output didn't match the expected schema after a retry. Detail: ${validated.message}`,
        );
      }
    }

    switch (validated.kind) {
      case "proposal":
        return {
          kind: "proposal",
          proposal: resolveProposal(input.currentTemplate, validated.proposal),
        };
      case "clarify":
        return { kind: "clarify", question: validated.question };
      case "refuse":
        return { kind: "refuse", reason: validated.reason };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return retryableError(`LLM call failed: ${message}`);
  }
}

type FunctionToolCall = Extract<
  OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
  { type: "function" }
>;

function findToolCall(
  response: OpenAI.Chat.Completions.ChatCompletion,
): FunctionToolCall | null {
  const choice = response.choices[0];
  const toolCalls = choice?.message?.tool_calls;
  if (!toolCalls || toolCalls.length === 0) return null;
  // We only ever expect one tool call per turn (tool_choice: "required" +
  // single-tool semantics encouraged by the system prompt).
  const first = toolCalls[0];
  if (first.type !== "function") return null;
  return first;
}

function parseArgs(raw: string): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { __unparseable: raw };
  }
}

type Validated =
  | { kind: "proposal"; proposal: ReturnType<typeof ProposalSchema.parse> }
  | { kind: "clarify"; question: string }
  | { kind: "refuse"; reason: string }
  | { kind: "error"; message: string };

export function validate(name: string, input: unknown): Validated {
  if (name === "propose_template") {
    const r = ProposalSchema.safeParse(input);
    return r.success
      ? { kind: "proposal", proposal: r.data }
      : { kind: "error", message: formatZod(r.error) };
  }
  if (name === "clarify") {
    const r = ClarifySchema.safeParse(input);
    return r.success
      ? { kind: "clarify", question: r.data.question }
      : { kind: "error", message: formatZod(r.error) };
  }
  if (name === "refuse") {
    const r = RefuseSchema.safeParse(input);
    return r.success
      ? { kind: "refuse", reason: r.data.reason }
      : { kind: "error", message: formatZod(r.error) };
  }
  return { kind: "error", message: `Unknown tool: ${name}` };
}

function formatZod(error: import("zod").ZodError): string {
  return error.issues
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

function retryableError(message: string): AIResponse {
  return { kind: "error", message, retryable: true };
}
