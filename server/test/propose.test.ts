import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import type { Template } from "@shared/schema.ts";
import { propose, type LLMCall } from "../src/llm/propose.ts";

function fakeResponse(
  toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
  textContent: string | null = null,
): OpenAI.Chat.Completions.ChatCompletion {
  return {
    id: "chatcmpl_test",
    object: "chat.completion",
    created: 0,
    model: "test",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textContent,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          refusal: null,
        } as OpenAI.Chat.Completions.ChatCompletionMessage,
        finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  } as OpenAI.Chat.Completions.ChatCompletion;
}

function toolCall(
  name: string,
  input: unknown,
  id = "call_1",
): OpenAI.Chat.Completions.ChatCompletionMessageToolCall {
  return {
    id,
    type: "function",
    function: { name, arguments: JSON.stringify(input) },
  } as OpenAI.Chat.Completions.ChatCompletionMessageToolCall;
}

const EMPTY_TEMPLATE: Template = {
  id: "T1",
  name: "",
  description: "",
  sections: [],
};

describe("propose (orchestrator)", () => {
  it("returns a proposal on a valid first tool call", async () => {
    const llmCall: LLMCall = async () =>
      fakeResponse([
        toolCall("propose_template", {
          name: "SOAP",
          description: "SOAP note for primary care.",
          sections: [
            { id: null, title: "Subjective", description: "Capture chief complaint." },
          ],
          rationale: "Built a baseline SOAP template.",
          change_summary: ["Added Subjective section"],
        }),
      ]);

    const result = await propose({
      userMessage: "make a SOAP template",
      currentTemplate: EMPTY_TEMPLATE,
      chatHistory: [],
      llmCall,
    });

    expect(result.kind).toBe("proposal");
    if (result.kind === "proposal") {
      expect(result.proposal.template.sections).toHaveLength(1);
      expect(result.proposal.rationale).toContain("baseline");
    }
  });

  it("routes a clarify tool call to a clarify response", async () => {
    const llmCall: LLMCall = async () =>
      fakeResponse([toolCall("clarify", { question: "What specialty?" })]);
    const result = await propose({
      userMessage: "make it better",
      currentTemplate: EMPTY_TEMPLATE,
      chatHistory: [],
      llmCall,
    });
    expect(result.kind).toBe("clarify");
  });

  it("routes a refuse tool call to a refuse response", async () => {
    const llmCall: LLMCall = async () =>
      fakeResponse([toolCall("refuse", { reason: "Not a template request." })]);
    const result = await propose({
      userMessage: "write me a poem",
      currentTemplate: EMPTY_TEMPLATE,
      chatHistory: [],
      llmCall,
    });
    expect(result.kind).toBe("refuse");
  });

  it("retries once on schema-invalid output and succeeds on the second try", async () => {
    let call = 0;
    const llmCall: LLMCall = async () => {
      call++;
      if (call === 1) {
        // First call returns missing-required-fields garbage
        return fakeResponse([toolCall("propose_template", { name: "X" })]);
      }
      return fakeResponse([
        toolCall("propose_template", {
          name: "X",
          description: "Y",
          sections: [{ id: null, title: "Z", description: "z" }],
          rationale: "fixed",
          change_summary: [],
        }),
      ]);
    };
    const result = await propose({
      userMessage: "do the thing",
      currentTemplate: EMPTY_TEMPLATE,
      chatHistory: [],
      llmCall,
    });
    expect(call).toBe(2);
    expect(result.kind).toBe("proposal");
  });

  it("returns a retryable error if both attempts fail validation", async () => {
    let call = 0;
    const llmCall: LLMCall = async () => {
      call++;
      return fakeResponse([toolCall("propose_template", { name: "" })]);
    };
    const result = await propose({
      userMessage: "do it",
      currentTemplate: EMPTY_TEMPLATE,
      chatHistory: [],
      llmCall,
    });
    expect(call).toBe(2);
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.retryable).toBe(true);
  });

  it("returns an error if the model returns no tool call", async () => {
    const llmCall: LLMCall = async () => fakeResponse([], "Sure!");
    const result = await propose({
      userMessage: "do it",
      currentTemplate: EMPTY_TEMPLATE,
      chatHistory: [],
      llmCall,
    });
    expect(result.kind).toBe("error");
  });

  it("catches a thrown network error and returns a retryable error", async () => {
    const llmCall: LLMCall = async () => {
      throw new Error("ECONNRESET");
    };
    const result = await propose({
      userMessage: "do it",
      currentTemplate: EMPTY_TEMPLATE,
      chatHistory: [],
      llmCall,
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.retryable).toBe(true);
      expect(result.message).toContain("ECONNRESET");
    }
  });

  it("recovers gracefully when the model returns unparseable JSON arguments", async () => {
    // Strict mode should prevent this, but if it ever happens we shouldn't crash.
    let call = 0;
    const llmCall: LLMCall = async () => {
      call++;
      if (call === 1) {
        return fakeResponse([
          {
            id: "call_x",
            type: "function",
            function: { name: "propose_template", arguments: "{not json" },
          } as OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
        ]);
      }
      return fakeResponse([
        toolCall("propose_template", {
          name: "X",
          description: "Y",
          sections: [{ id: null, title: "Z", description: "z" }],
          rationale: "fixed",
          change_summary: [],
        }),
      ]);
    };
    const result = await propose({
      userMessage: "do it",
      currentTemplate: EMPTY_TEMPLATE,
      chatHistory: [],
      llmCall,
    });
    expect(result.kind).toBe("proposal");
  });
});
