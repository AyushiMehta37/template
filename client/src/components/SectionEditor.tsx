import type { Section } from "@shared/schema.ts";

type Props = {
  index: number;
  total: number;
  section: Section;
  onChange: (patch: Partial<Section>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
};

export function SectionEditor({
  index,
  total,
  section,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: Props) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 font-mono w-6 text-center">
          {index + 1}.
        </span>
        <input
          value={section.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Section title (e.g., Assessment)"
          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-1 text-xs">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Move up"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Move down"
          >
            ↓
          </button>
          <button
            onClick={onRemove}
            className="rounded px-1.5 py-0.5 text-red-500 hover:bg-red-50"
            title="Remove"
          >
            ×
          </button>
        </div>
      </div>
      <textarea
        value={section.description}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Instruction to the summarizer (e.g., 'Summarize the clinician's clinical impression…')"
        rows={3}
        className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
