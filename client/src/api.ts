import type { ChatMessage, Template } from "@shared/schema.ts";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const json = (await res.json().catch(() => ({ ok: false, error: "Bad JSON from server" }))) as
    | { ok: true } & T
    | { ok: false; error: string };
  if (!("ok" in json) || json.ok !== true) {
    throw new Error("error" in json ? json.error : "Request failed");
  }
  return json as T;
}

export const api = {
  getTemplate: () =>
    request<{ template: Template }>("/api/template"),

  saveTemplate: (template: Template) =>
    request<{ template: Template }>("/api/template", {
      method: "PUT",
      body: JSON.stringify(template),
    }),

  resetTemplate: () =>
    request<{ template: Template }>("/api/template/reset", { method: "POST" }),

  getChat: () => request<{ chat: ChatMessage[] }>("/api/ai/chat"),

  sendMessage: (message: string) =>
    request<{ message: ChatMessage; chat: ChatMessage[] }>("/api/ai/message", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  acceptProposal: (messageId: string) =>
    request<{ template: Template; chat: ChatMessage[] }>("/api/ai/accept", {
      method: "POST",
      body: JSON.stringify({ messageId }),
    }),

  rejectProposal: (messageId: string) =>
    request<{ chat: ChatMessage[] }>("/api/ai/reject", {
      method: "POST",
      body: JSON.stringify({ messageId }),
    }),
};
