import { randomUUID } from "node:crypto";
import type { ChatMessage, Template } from "@shared/schema.ts";

/**
 * In-memory state. The spec explicitly allows this — no DB.
 * Single-template singleton + bounded chat history + pending-proposal slot
 * (so accepting a proposal doesn't race with the next AI turn).
 */

const MAX_CHAT_HISTORY = 12;

let template: Template = {
  id: randomUUID(),
  name: "",
  description: "",
  sections: [],
};

let chat: ChatMessage[] = [];

export const state = {
  getTemplate(): Template {
    return template;
  },
  setTemplate(next: Template) {
    template = next;
  },
  getChat(): ChatMessage[] {
    return chat;
  },
  appendChat(msg: ChatMessage) {
    chat.push(msg);
    if (chat.length > MAX_CHAT_HISTORY) {
      chat = chat.slice(chat.length - MAX_CHAT_HISTORY);
    }
  },
  updateMessage(id: string, patch: Partial<ChatMessage>) {
    chat = chat.map((m) =>
      m.id === id ? ({ ...m, ...patch } as ChatMessage) : m,
    );
  },
  reset() {
    template = {
      id: randomUUID(),
      name: "",
      description: "",
      sections: [],
    };
    chat = [];
  },
};
