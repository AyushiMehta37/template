import { describe, expect, it } from "vitest";
import { renderCurrentTemplate, SYSTEM_PROMPT } from "../src/llm/prompt.ts";

describe("system prompt", () => {
  /**
   * The system prompt is a real artifact in this system. We snapshot it so
   * unintended edits are caught in PR review. To update intentionally:
   *   `vitest --update`
   */
  it("matches snapshot", () => {
    expect(SYSTEM_PROMPT).toMatchSnapshot();
  });

  it("mentions the ID preservation rule (load-bearing for the diff)", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("id preservation");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("verbatim");
  });

  it("mentions the refuse and clarify tools", () => {
    expect(SYSTEM_PROMPT).toContain("clarify");
    expect(SYSTEM_PROMPT).toContain("refuse");
  });
});

describe("renderCurrentTemplate", () => {
  it("returns an empty marker for a fully-empty template", () => {
    const out = renderCurrentTemplate({
      id: "T1",
      name: "",
      description: "",
      sections: [],
    });
    expect(out).toContain("(empty");
  });

  it("includes section IDs and titles so the model can echo them back", () => {
    const out = renderCurrentTemplate({
      id: "T1",
      name: "Test",
      description: "desc",
      sections: [{ id: "s1", title: "Assessment", description: "x" }],
    });
    expect(out).toContain('id="s1"');
    expect(out).toContain("Assessment");
  });

  it("escapes XML special characters in user content", () => {
    const out = renderCurrentTemplate({
      id: "T1",
      name: "A & B",
      description: "<test>",
      sections: [],
    });
    expect(out).toContain("A &amp; B");
    expect(out).toContain("&lt;test&gt;");
  });
});
