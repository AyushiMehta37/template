import { describe, expect, it } from "vitest";
import { validate } from "../src/llm/propose.ts";

describe("validate (Zod-backed)", () => {
  it("accepts a well-formed propose_template input", () => {
    const r = validate("propose_template", {
      name: "SOAP",
      description: "SOAP note",
      sections: [{ title: "Subjective", description: "Capture chief complaint." }],
      rationale: "ok",
      change_summary: [],
    });
    expect(r.kind).toBe("proposal");
  });

  it("rejects propose_template missing required name", () => {
    const r = validate("propose_template", {
      description: "x",
      sections: [{ title: "Y", description: "y" }],
      rationale: "r",
      change_summary: [],
    });
    expect(r.kind).toBe("error");
  });

  it("rejects propose_template with empty sections", () => {
    const r = validate("propose_template", {
      name: "x",
      description: "y",
      sections: [],
      rationale: "r",
      change_summary: [],
    });
    expect(r.kind).toBe("error");
  });

  it("rejects propose_template with empty title", () => {
    const r = validate("propose_template", {
      name: "x",
      description: "y",
      sections: [{ title: "", description: "d" }],
      rationale: "r",
      change_summary: [],
    });
    expect(r.kind).toBe("error");
  });

  it("rejects propose_template wrapped in prose (string instead of object)", () => {
    const r = validate(
      "propose_template",
      "Here is your template: { ... }",
    );
    expect(r.kind).toBe("error");
  });

  it("accepts a valid clarify", () => {
    const r = validate("clarify", { question: "What specialty?" });
    expect(r.kind).toBe("clarify");
  });

  it("accepts a valid refuse", () => {
    const r = validate("refuse", { reason: "Not a template request." });
    expect(r.kind).toBe("refuse");
  });

  it("rejects clarify with no question", () => {
    expect(validate("clarify", { question: "" }).kind).toBe("error");
  });

  it("rejects unknown tool names", () => {
    expect(validate("unknown_tool", {}).kind).toBe("error");
  });

  it("provides a sane defaulted change_summary array when missing", () => {
    const r = validate("propose_template", {
      name: "x",
      description: "y",
      sections: [{ title: "T", description: "d" }],
      rationale: "r",
      // change_summary intentionally omitted — Zod default is []
    });
    expect(r.kind).toBe("proposal");
  });
});
