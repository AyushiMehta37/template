import type { Template } from "@shared/schema.ts";

/**
 * Serialise a template as canonical JSON — same shape stored on the server,
 * pretty-printed. This is the format a downstream summarizer integration
 * would consume.
 */
export function toJson(template: Template): string {
  return JSON.stringify(
    {
      name: template.name,
      description: template.description,
      sections: template.sections.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
      })),
    },
    null,
    2,
  );
}

/**
 * Serialise a template as Markdown — for humans reading or copy-pasting into
 * a doc / chart-prep tool. The template `name` becomes H1, the template
 * description becomes a paragraph, each section title is H2, each section
 * description is a paragraph.
 */
export function toMarkdown(template: Template): string {
  const lines: string[] = [];
  lines.push(`# ${template.name || "Untitled template"}`);
  if (template.description) {
    lines.push("", template.description);
  }
  for (const section of template.sections) {
    lines.push("", `## ${section.title}`, "", section.description);
  }
  return lines.join("\n") + "\n";
}

/** Slugify a template name for a download filename. */
export function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "untitled-template";
}

/** Trigger a browser download for the given text content. */
export function download(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadJson(template: Template): void {
  download(`template-${slug(template.name)}.json`, toJson(template), "application/json");
}

export function downloadMarkdown(template: Template): void {
  download(
    `template-${slug(template.name)}.md`,
    toMarkdown(template),
    "text/markdown",
  );
}
