import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  MAX_USER_INPUT_LENGTH,
  type ChatMessage,
  type ChatTurn,
} from "@shared/schema.ts";
import { propose } from "../llm/propose.ts";
import { state } from "../state.ts";

export const aiRouter = Router();

/** POST /api/ai/message — body: { message: string } */
aiRouter.post("/message", async (req, res) => {
  const raw = (req.body?.message ?? "") as unknown;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Please type a message describing what you'd like to do.",
    });
  }
  if (raw.length > MAX_USER_INPUT_LENGTH) {
    return res.status(413).json({
      ok: false,
      error: `Message is too long (max ${MAX_USER_INPUT_LENGTH} characters).`,
    });
  }
  const message = raw.trim();

  const userMsg: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content: message,
  };
  state.appendChat(userMsg);

  const result = await propose({
    userMessage: message,
    currentTemplate: state.getTemplate(),
    chatHistory: buildChatHistory(state.getChat()),
  });

  let assistantMsg: ChatMessage;
  switch (result.kind) {
    case "proposal":
      assistantMsg = {
        id: randomUUID(),
        role: "assistant",
        kind: "proposal",
        proposal: result.proposal,
        status: "pending",
        telemetry: result.telemetry,
      };
      break;
    case "clarify":
      assistantMsg = {
        id: randomUUID(),
        role: "assistant",
        kind: "clarify",
        question: result.question,
        telemetry: result.telemetry,
      };
      break;
    case "refuse":
      assistantMsg = {
        id: randomUUID(),
        role: "assistant",
        kind: "refuse",
        reason: result.reason,
        telemetry: result.telemetry,
      };
      break;
    case "error":
      assistantMsg = {
        id: randomUUID(),
        role: "assistant",
        kind: "error",
        message: result.message,
        retryable: result.retryable,
      };
      break;
  }
  state.appendChat(assistantMsg);

  res.json({ ok: true, message: assistantMsg, chat: state.getChat() });
});

/**
 * POST /api/ai/accept — body: { messageId }
 * Apply a pending proposal to the current template, then mark it accepted.
 */
aiRouter.post("/accept", (req, res) => {
  const id = (req.body?.messageId ?? "") as unknown;
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ ok: false, error: "messageId is required." });
  }
  const msg = state.getChat().find((m) => m.id === id);
  if (!msg || msg.role !== "assistant" || msg.kind !== "proposal") {
    return res.status(404).json({ ok: false, error: "Proposal not found." });
  }
  if (msg.status !== "pending") {
    return res
      .status(409)
      .json({ ok: false, error: `Proposal already ${msg.status}.` });
  }
  state.setTemplate(msg.proposal.template);
  state.updateMessage(id, { status: "accepted" } as Partial<ChatMessage>);
  res.json({
    ok: true,
    template: state.getTemplate(),
    chat: state.getChat(),
  });
});

aiRouter.post("/reject", (req, res) => {
  const id = (req.body?.messageId ?? "") as unknown;
  if (typeof id !== "string" || !id) {
    return res.status(400).json({ ok: false, error: "messageId is required." });
  }
  const msg = state.getChat().find((m) => m.id === id);
  if (!msg || msg.role !== "assistant" || msg.kind !== "proposal") {
    return res.status(404).json({ ok: false, error: "Proposal not found." });
  }
  if (msg.status !== "pending") {
    return res
      .status(409)
      .json({ ok: false, error: `Proposal already ${msg.status}.` });
  }
  state.updateMessage(id, { status: "rejected" } as Partial<ChatMessage>);
  res.json({ ok: true, chat: state.getChat() });
});

aiRouter.get("/chat", (_req, res) => {
  res.json({ ok: true, chat: state.getChat() });
});

/**
 * Build the chat history we send back to the model. Strips non-text assistant
 * payloads (proposals, clarifies, etc.) down to a short text summary so the
 * model can see the conversational arc without us re-serializing structured
 * payloads it produced previously. The current template (separately injected
 * on every turn) is the source of truth for state.
 */
function buildChatHistory(chat: ChatMessage[]): ChatTurn[] {
  // Drop the most recent user message — we add it back via userMessage in propose()
  const trimmed = chat.slice(0, -1);
  // Keep only the last 6 turns for cost + latency
  const tail = trimmed.slice(-6);
  return tail.map<ChatTurn>((m) => {
    if (m.role === "user") return { role: "user", content: m.content };
    switch (m.kind) {
      case "proposal":
        return {
          role: "assistant",
          content: `[Proposed template change — ${m.status}] ${m.proposal.rationale}`,
        };
      case "clarify":
        return { role: "assistant", content: `[Asked for clarification] ${m.question}` };
      case "refuse":
        return { role: "assistant", content: `[Refused] ${m.reason}` };
      case "error":
        return { role: "assistant", content: `[Error] ${m.message}` };
    }
  });
}
