import { useEffect, useRef, useState } from "react";
import {
  MAX_USER_INPUT_LENGTH,
  type ChatMessage,
  type Telemetry,
} from "@shared/schema.ts";
import { DiffView } from "./DiffView.tsx";

const STARTER_PROMPTS = [
  "Create a SOAP note template for a physiotherapy follow-up visit.",
  "Build me a cardiology intake template.",
  "Generate a brief telehealth visit template.",
];

type Props = {
  chat: ChatMessage[];
  onSend: (message: string) => Promise<void>;
  onAccept: (messageId: string) => Promise<void>;
  onReject: (messageId: string) => Promise<void>;
};

export function ChatPanel({ chat, onSend, onAccept, onReject }: Props) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat, sending]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setSendError(null);
    setInput("");
    try {
      await onSend(trimmed);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
      setInput(trimmed);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="border-b border-slate-200 bg-white px-4 py-2.5 flex-shrink-0">
        <h2 className="text-sm font-semibold text-slate-700">AI helper</h2>
        <p className="text-xs text-slate-500">
          Describe what you want the template to do. The AI will propose changes; you accept or reject.
        </p>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {chat.length === 0 && (
          <div className="text-sm text-slate-500 py-6 space-y-3">
            <p className="text-center text-slate-400">No messages yet. Try one to start:</p>
            <div className="flex flex-col gap-1.5">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setInput(p)}
                  className="text-left text-xs rounded border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 px-3 py-2 text-slate-700 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m) => (
          <Message
            key={m.id}
            msg={m}
            onAccept={() => onAccept(m.id)}
            onReject={() => onReject(m.id)}
          />
        ))}
        {sending && (
          <div className="text-xs text-slate-500 italic px-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
            Thinking…
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-slate-200 bg-white p-3 flex-shrink-0"
      >
        {sendError && (
          <div className="text-xs text-red-600 mb-2 px-1">{sendError}</div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
            placeholder='e.g. "Add a section for home exercise plan"'
            maxLength={MAX_USER_INPUT_LENGTH}
            rows={2}
            disabled={sending}
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400 resize-none"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
        <div className="text-[10px] text-slate-400 mt-1 px-1">
          ⌘+Enter to send · {input.length}/{MAX_USER_INPUT_LENGTH}
        </div>
      </form>
    </div>
  );
}

function Message({
  msg,
  onAccept,
  onReject,
}: {
  msg: ChatMessage;
  onAccept: () => void;
  onReject: () => void;
}) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 text-white px-3 py-2 text-sm whitespace-pre-wrap">
          {msg.content}
        </div>
      </div>
    );
  }

  switch (msg.kind) {
    case "proposal":
      return (
        <div className="flex justify-start">
          <div className="max-w-full w-full">
            <DiffView
              proposal={msg.proposal}
              status={msg.status}
              onAccept={onAccept}
              onReject={onReject}
            />
            <TelemetryFooter telemetry={msg.telemetry} align="left" />
          </div>
        </div>
      );
    case "clarify":
      return (
        <div className="flex justify-start">
          <div className="max-w-[85%]">
            <div className="rounded-2xl rounded-tl-sm bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mb-1">
                Clarifying question
              </div>
              {msg.question}
            </div>
            <TelemetryFooter telemetry={msg.telemetry} align="left" />
          </div>
        </div>
      );
    case "refuse":
      return (
        <div className="flex justify-start">
          <div className="max-w-[85%]">
            <div className="rounded-2xl rounded-tl-sm bg-slate-100 border border-slate-200 text-slate-700 px-3 py-2 text-sm">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Out of scope
              </div>
              {msg.reason}
            </div>
            <TelemetryFooter telemetry={msg.telemetry} align="left" />
          </div>
        </div>
      );
    case "error":
      return (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-red-600 mb-1">
              Error
            </div>
            {msg.message}
            {msg.retryable && (
              <div className="text-[10px] text-red-600 mt-1">
                Please try again.
              </div>
            )}
          </div>
        </div>
      );
  }
}

function TelemetryFooter({
  telemetry,
  align,
}: {
  telemetry?: Telemetry;
  align: "left" | "right";
}) {
  if (!telemetry) return null;
  const validityNote = telemetry.firstTryValid ? "" : ` · retried`;
  return (
    <div
      className={`text-[10px] text-slate-400 mt-1 px-1 font-mono ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {telemetry.model} · {telemetry.latencyMs}ms · {telemetry.inputTokens} in /{" "}
      {telemetry.outputTokens} out · prompt {telemetry.promptVersion}
      {validityNote}
    </div>
  );
}
