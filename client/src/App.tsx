import { useCallback, useEffect, useState } from "react";
import type { ChatMessage, Template } from "@shared/schema.ts";
import { api } from "./api.ts";
import { ChatPanel } from "./components/ChatPanel.tsx";
import { TemplateEditor } from "./components/TemplateEditor.tsx";

export default function App() {
  const [template, setTemplate] = useState<Template | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    (async () => {
      try {
        const [t, c] = await Promise.all([api.getTemplate(), api.getChat()]);
        setTemplate(t.template);
        setChat(c.chat);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleTemplateChange = useCallback(async (next: Template) => {
    setTemplate(next);
    setSaveStatus("saving");
    try {
      const r = await api.saveTemplate(next);
      setTemplate(r.template);
      setSaveStatus("saved");
    } catch (err) {
      console.error("Failed to save template:", err);
      setSaveStatus("error");
    }
  }, []);

  const handleSend = useCallback(async (message: string) => {
    const r = await api.sendMessage(message);
    setChat(r.chat);
  }, []);

  const handleAccept = useCallback(async (messageId: string) => {
    const r = await api.acceptProposal(messageId);
    setTemplate(r.template);
    setChat(r.chat);
  }, []);

  const handleReject = useCallback(async (messageId: string) => {
    const r = await api.rejectProposal(messageId);
    setChat(r.chat);
  }, []);

  const handleReset = useCallback(async () => {
    if (!confirm("Reset the template and chat? This cannot be undone.")) return;
    const r = await api.resetTemplate();
    setTemplate(r.template);
    const c = await api.getChat();
    setChat(c.chat);
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-500">Loading…</div>;
  }
  if (loadError || !template) {
    return (
      <div className="p-8 text-red-600">
        Failed to load: {loadError ?? "no template"}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Vocanote — Template Builder</h1>
          <p className="text-xs text-slate-500">
            Author and refine a clinical-note template with an AI helper.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Reset
        </button>
      </header>
      <main className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-0">
        <section className="overflow-y-auto bg-white border-r border-slate-200 p-6">
          <TemplateEditor
            template={template}
            onChange={handleTemplateChange}
            saveStatus={saveStatus}
          />
        </section>
        <section className="overflow-hidden bg-slate-50 flex flex-col min-h-0">
          <ChatPanel
            chat={chat}
            onSend={handleSend}
            onAccept={handleAccept}
            onReject={handleReject}
          />
        </section>
      </main>
    </div>
  );
}
