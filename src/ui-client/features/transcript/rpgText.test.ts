import { describe, expect, it } from "vitest";
import { parseStoryText } from "./rpgText";

describe("parseStoryText", () => {
  it("splits starred narration from dialogue", () => {
    expect(parseStoryText(`"Five gold." *He taps the cage.* "Final."`)).toEqual([
      { kind: "dialogue", text: `"Five gold." ` },
      { kind: "narration", text: "He taps the cage." },
      { kind: "dialogue", text: ` "Final."` },
    ]);
  });
  it("keeps double stars and escaped stars literal, and an unfinished span as narration", () => {
    expect(parseStoryText("a **b** \\*c *open")).toEqual([{ kind: "dialogue", text: "a **b** *c " }, { kind: "narration", text: "open" }]);
  });
  it("returns markup as plain text (never HTML)", () => {
    expect(parseStoryText("<img src=x onerror=alert(1)>")).toEqual([{ kind: "dialogue", text: "<img src=x onerror=alert(1)>" }]);
  });
});
