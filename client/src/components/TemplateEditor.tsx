import { useCallback } from "react";
import type { Section, Template } from "@shared/schema.ts";
import { downloadJson, downloadMarkdown } from "../lib/export-template.ts";
import { SectionEditor } from "./SectionEditor.tsx";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  template: Template;
  onChange: (next: Template) => void;
  saveStatus?: SaveStatus;
};

export function TemplateEditor({ template, onChange, saveStatus = "idle" }: Props) {
  const update = useCallback(
    (patch: Partial<Template>) => onChange({ ...template, ...patch }),
    [template, onChange],
  );

  const updateSection = useCallback(
    (id: string, patch: Partial<Section>) => {
      onChange({
        ...template,
        sections: template.sections.map((s) =>
          s.id === id ? { ...s, ...patch } : s,
        ),
      });
    },
    [template, onChange],
  );

  const move = useCallback(
    (id: string, direction: -1 | 1) => {
      const idx = template.sections.findIndex((s) => s.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= template.sections.length) return;
      const sections = [...template.sections];
      [sections[idx], sections[target]] = [sections[target], sections[idx]];
      onChange({ ...template, sections });
    },
    [template, onChange],
  );

  const remove = useCallback(
    (id: string) => {
      onChange({
        ...template,
        sections: template.sections.filter((s) => s.id !== id),
      });
    },
    [template, onChange],
  );

  const addSection = useCallback(() => {
    // Empty id signals server to mint one
    const next = {
      ...template,
      sections: [
        ...template.sections,
        {
          id: `__new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: "New section",
          description: "Describe what the summarizer should write here.",
        },
      ],
    };
    onChange(next);
  }, [template, onChange]);

  const canExport = template.sections.length > 0;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Template</h2>
        <div className="flex items-center gap-3">
          <SaveIndicator status={saveStatus} />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => downloadJson(template)}
              disabled={!canExport}
              title={canExport ? "Download as JSON" : "Add a section first"}
              className="text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 px-2 py-1 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ↓ JSON
            </button>
            <button
              type="button"
              onClick={() => downloadMarkdown(template)}
              disabled={!canExport}
              title={canExport ? "Download as Markdown" : "Add a section first"}
              className="text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 px-2 py-1 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ↓ Markdown
            </button>
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          Template name
        </label>
        <input
          value={template.name}
          placeholder="e.g., SOAP Note — Physiotherapy Follow-up"
          onChange={(e) => update({ name: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
          Description
        </label>
        <textarea
          value={template.description}
          placeholder="What is this template for? Who uses it? When?"
          rows={2}
          onChange={(e) => update({ description: e.target.value })}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            Sections ({template.sections.length})
          </h2>
          <button
            onClick={addSection}
            className="text-xs rounded bg-slate-100 hover:bg-slate-200 px-3 py-1 text-slate-700"
          >
            + Add section
          </button>
        </div>

        {template.sections.length === 0 ? (
          <p className="text-sm text-slate-500 italic">
            No sections yet. Add one manually, or ask the AI helper to generate a template.
          </p>
        ) : (
          <ul className="space-y-3">
            {template.sections.map((s, i) => (
              <li key={s.id}>
                <SectionEditor
                  index={i}
                  total={template.sections.length}
                  section={s}
                  onChange={(patch) => updateSection(s.id, patch)}
                  onMoveUp={() => move(s.id, -1)}
                  onMoveDown={() => move(s.id, 1)}
                  onRemove={() => remove(s.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "idle") {
    return null;
  }
  const cls =
    status === "saving"
      ? "text-slate-500"
      : status === "saved"
        ? "text-emerald-600"
        : "text-red-600";
  const dotCls =
    status === "saving"
      ? "bg-slate-400 animate-pulse"
      : status === "saved"
        ? "bg-emerald-500"
        : "bg-red-500";
  const label =
    status === "saving" ? "Saving…" : status === "saved" ? "Saved" : "Save failed";
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${cls}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotCls}`} />
      {label}
    </span>
  );
}
