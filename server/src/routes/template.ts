import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { Template } from "@shared/schema.ts";
import { state } from "../state.ts";

export const templateRouter = Router();

templateRouter.get("/", (_req, res) => {
  res.json({ ok: true, template: state.getTemplate() });
});

/**
 * Manual hand-edits from the editor pane.
 *
 * We deliberately do NOT enforce the strict TemplateSchema here — a clinician
 * editing by hand will pass through partial states (name typed, no sections
 * yet; or a section being authored with an empty title). Rejecting those
 * would flash "Save failed" as they type. The strict schema is enforced
 * where it actually matters: when the AI tool returns a proposal, and at the
 * boundary where a template gets used for downstream summarization.
 *
 * We do normalize the shape (mint missing IDs, coerce missing strings to "")
 * so the in-memory state stays well-typed.
 */
templateRouter.put("/", (req, res) => {
  const body = req.body as Partial<Template> | undefined;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ ok: false, error: "Body must be a JSON object." });
  }

  const current = state.getTemplate();
  const next: Template = {
    id: current.id,
    name: typeof body.name === "string" ? body.name : "",
    description: typeof body.description === "string" ? body.description : "",
    sections: (Array.isArray(body.sections) ? body.sections : []).map((s) => ({
      id: s && typeof s.id === "string" && s.id ? s.id : randomUUID(),
      title: s && typeof s.title === "string" ? s.title : "",
      description: s && typeof s.description === "string" ? s.description : "",
    })),
  };

  state.setTemplate(next);
  res.json({ ok: true, template: next });
});

templateRouter.post("/reset", (_req, res) => {
  state.reset();
  res.json({ ok: true, template: state.getTemplate() });
});
