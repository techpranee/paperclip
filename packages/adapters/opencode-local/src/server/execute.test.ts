import { describe, expect, it } from "vitest";
import { renderOpenCodeToolContractNote } from "./execute.js";

describe("opencode_local tool contract note", () => {
  it("tells the agent to read an existing file before overwriting it", () => {
    const note = renderOpenCodeToolContractNote("");

    expect(note).toContain("Before overwriting any existing file, read that exact path first.");
    expect(note).toContain(
      "Do not call a write/create tool on an existing file you have not read in this run.",
    );
  });

  it("adds fallback workspace guidance for agent-home runs", () => {
    const note = renderOpenCodeToolContractNote("agent_home");

    expect(note).toContain(
      "This run may be in a fallback workspace; confirm you are touching the intended project path before editing files.",
    );
  });
});