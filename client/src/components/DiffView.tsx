import { useState } from "react";
import type { DiffItem, ResolvedProposal } from "@shared/schema.ts";
import { isHeavyChange, wordDiff } from "../lib/inline-diff.ts";

type Props = {
  proposal: ResolvedProposal;
  status: "pending" | "accepted" | "rejected";
  onAccept: () => void;
  onReject: () => void;
};

export function DiffView({ proposal, status, onAccept, onReject }: Props) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const { template, diff, reordered, metadataChanged, rationale, changeSummary } = proposal;
  const counts = {
    added: diff.filter((d) => d.kind === "added").length,
    removed: diff.filter((d) => d.kind === "removed").length,
    edited: diff.filter((d) => d.kind === "edited").length,
  };

  return (
    <div
      className={
        "rounded-lg border bg-white shadow-sm " +
        (status === "accepted"
          ? "border-emerald-300"
          : status === "rejected"
            ? "border-slate-200 opacity-60"
            : "border-slate-300")
      }
    >
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Proposed change
          </div>
          <StatusBadge status={status} />
        </div>
        <div className="text-sm text-slate-700 mt-1">{rationale}</div>
        <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
          {counts.added > 0 && (
            <Pill tone="add">+{counts.added} added</Pill>
          )}
          {counts.edited > 0 && (
            <Pill tone="edit">~{counts.edited} edited</Pill>
          )}
          {counts.removed > 0 && (
            <Pill tone="remove">−{counts.removed} removed</Pill>
          )}
          {reordered && <Pill tone="reorder">↕ reordered</Pill>}
          {metadataChanged.name && <Pill tone="edit">name changed</Pill>}
          {metadataChanged.description && (
            <Pill tone="edit">description changed</Pill>
          )}
          {counts.added + counts.edited + counts.removed === 0 &&
            !reordered &&
            !metadataChanged.name &&
            !metadataChanged.description && (
              <Pill tone="reorder">no content changes</Pill>
            )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {(metadataChanged.name || metadataChanged.description) && (
          <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs space-y-1">
            <div className="font-semibold text-amber-900">Template metadata</div>
            <div>
              <span className="text-amber-700">Name:</span>{" "}
              <span className="font-medium text-amber-900">{template.name}</span>
            </div>
            <div>
              <span className="text-amber-700">Description:</span>{" "}
              <span className="text-amber-900">{template.description}</span>
            </div>
          </div>
        )}

        {(() => {
          const unchangedCount = diff.filter((d) => d.kind === "unchanged").length;
          const hasChanges = diff.some((d) => d.kind !== "unchanged");
          // When there are real changes, hide unchanged rows behind a toggle so
          // the eye lands on the actual diff. If everything is unchanged (e.g.
          // a pure reorder), keep them visible since the reorder pill at the
          // top is the only signal.
          const collapseUnchanged = hasChanges && !showUnchanged && unchangedCount > 0;
          const visibleDiff = collapseUnchanged
            ? diff.filter((d) => d.kind !== "unchanged")
            : diff;
          return (
            <>
              <ol className="space-y-2">
                {visibleDiff.map((item, i) => (
                  <li key={diffKey(item, i)}>
                    <DiffRow item={item} />
                  </li>
                ))}
              </ol>
              {unchangedCount > 0 && hasChanges && (
                <button
                  type="button"
                  onClick={() => setShowUnchanged((v) => !v)}
                  className="text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
                >
                  {showUnchanged
                    ? `Hide ${unchangedCount} unchanged section${unchangedCount === 1 ? "" : "s"}`
                    : `+ ${unchangedCount} unchanged section${unchangedCount === 1 ? "" : "s"}`}
                </button>
              )}
            </>
          );
        })()}

        {changeSummary.length > 0 && (
          <div className="rounded bg-slate-50 border border-slate-200 p-2 text-xs">
            <div className="font-semibold text-slate-700 mb-1">Summary</div>
            <ul className="list-disc list-inside text-slate-600 space-y-0.5">
              {changeSummary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {status === "pending" ? (
        <div className="border-t border-slate-200 px-4 py-2 flex justify-end gap-2 bg-slate-50">
          <button
            onClick={onReject}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
          >
            Reject
          </button>
          <button
            onClick={onAccept}
            className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Accept
          </button>
        </div>
      ) : null}
    </div>
  );
}

function diffKey(item: DiffItem, i: number): string {
  switch (item.kind) {
    case "added":
      return `add-${item.section.id}-${i}`;
    case "removed":
      return `rem-${item.section.id}-${i}`;
    case "edited":
      return `edit-${item.after.id}-${i}`;
    case "unchanged":
      return `same-${item.section.id}-${i}`;
  }
}

function DiffRow({ item }: { item: DiffItem }) {
  switch (item.kind) {
    case "added":
      return (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <Pill tone="add">+ Added</Pill>
            <div className="text-sm font-medium text-emerald-900">
              {item.section.title}
            </div>
          </div>
          <div className="text-xs text-emerald-800 whitespace-pre-wrap">
            {item.section.description}
          </div>
        </div>
      );
    case "removed":
      return (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2">
          <div className="flex items-center gap-2 mb-1">
            <Pill tone="remove">− Removed</Pill>
            <div className="text-sm font-medium text-red-900 line-through">
              {item.section.title}
            </div>
          </div>
          <div className="text-xs text-red-800 line-through whitespace-pre-wrap">
            {item.section.description}
          </div>
        </div>
      );
    case "edited":
      return (
        <div className="rounded border border-amber-300 bg-amber-50/60 px-3 py-2 space-y-2">
          <div className="flex items-center gap-2">
            <Pill tone="edit">~ Edited</Pill>
            <div className="text-sm font-medium text-amber-900">
              {item.titleChanged ? (
                <>
                  <span className="text-amber-700">{item.before.title}</span>
                  <span className="mx-1.5 text-amber-500">→</span>
                  <span>{item.after.title}</span>
                </>
              ) : (
                item.after.title
              )}
            </div>
          </div>
          {item.descriptionChanged && (
            <DescriptionDiff before={item.before.description} after={item.after.description} />
          )}
        </div>
      );
    case "unchanged":
      return (
        <div className="rounded border border-slate-200 bg-white px-3 py-2 opacity-70">
          <div className="flex items-center gap-2 mb-1">
            <Pill tone="reorder">unchanged</Pill>
            <div className="text-sm text-slate-600">{item.section.title}</div>
          </div>
        </div>
      );
  }
}

function StatusBadge({
  status,
}: {
  status: "pending" | "accepted" | "rejected";
}) {
  if (status === "pending") return null;
  return (
    <span
      className={
        "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded " +
        (status === "accepted"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-500")
      }
    >
      {status}
    </span>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "add" | "remove" | "edit" | "reorder";
  children: React.ReactNode;
}) {
  const cls =
    tone === "add"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "remove"
        ? "bg-red-100 text-red-800"
        : tone === "edit"
          ? "bg-amber-100 text-amber-900"
          : "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}

/**
 * Inline word-level diff for the section description.
 *
 * For small edits (default case) renders a single paragraph where only the
 * changed words carry red/green styling — the reviewer's eye lands directly
 * on what changed.
 *
 * For heavy rewrites where > 60% of the text has changed, falls back to the
 * before / after two-block view, because inline diff becomes a wall of noise.
 */
function DescriptionDiff({ before, after }: { before: string; after: string }) {
  const parts = wordDiff(before, after);
  if (isHeavyChange(parts)) {
    return (
      <div className="space-y-1.5">
        <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 flex gap-2">
          <span aria-label="removed" className="text-rose-500 font-semibold leading-5 select-none">
            −
          </span>
          <p className="text-xs text-rose-900 whitespace-pre-wrap leading-5 flex-1">{before}</p>
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1.5 flex gap-2">
          <span aria-label="added" className="text-emerald-600 font-semibold leading-5 select-none">
            +
          </span>
          <p className="text-xs text-emerald-900 whitespace-pre-wrap leading-5 flex-1">{after}</p>
        </div>
      </div>
    );
  }
  return (
    <p className="text-xs text-amber-950 leading-5 whitespace-pre-wrap bg-white/70 rounded border border-amber-200 px-2 py-1.5">
      {parts.map((p, i) => {
        if (p.kind === "same") {
          return (
            <span key={i} className="text-slate-700">
              {p.text}
            </span>
          );
        }
        if (p.kind === "add") {
          return (
            <ins
              key={i}
              className="bg-emerald-100 text-emerald-900 rounded px-0.5 no-underline"
            >
              {p.text}
            </ins>
          );
        }
        return (
          <del key={i} className="bg-rose-100 text-rose-800 rounded px-0.5">
            {p.text}
          </del>
        );
      })}
    </p>
  );
}
