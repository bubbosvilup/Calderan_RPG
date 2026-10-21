import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Transcript } from "./Transcript";
import type { TranscriptMessage } from "../../api/types";
import { renderWithProviders } from "../../test/render";

const history = (n: number): TranscriptMessage[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "narrator" : "player", text: `Message ${i}`, seq: i }));

describe("Transcript", () => {
  it("distinguishes player and narrator messages", () => {
    renderWithProviders(<Transcript messages={history(2)} playerName="Nicco" pending={null} contentVersion="1" />);
    const items = screen.getAllByRole("article");
    expect(items[0]!.textContent).toBe("NiccoMessage 0");
    expect(items[1]!.textContent).toBe("NarratorMessage 1");
  });
  it("renders model text as text: markup is never interpreted", () => {
    renderWithProviders(<Transcript messages={[{ role: "narrator", text: `<img src=x onerror="window.pwned=1"> *bows*`, seq: 0 }]} playerName="Nicco" pending={null} contentVersion="1" />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("log").textContent).toContain(`<img src=x onerror="window.pwned=1">`);
  });
  it("renders the server's full 500-message window", () => {
    const started = performance.now();
    renderWithProviders(<Transcript messages={history(500)} playerName="Nicco" pending={null} contentVersion="1" />);
    expect(screen.getAllByRole("article")).toHaveLength(500);
    expect(performance.now() - started).toBeLessThan(5000);
  });
  it("shows the pending exchange with a status word from the closed table, outside the log", () => {
    renderWithProviders(<Transcript messages={history(1)} playerName="Nicco" pending={{ text: "I wave.", phase: "narrating" }} contentVersion="1" />);
    expect(screen.getByText("Narrating…")).toBeTruthy();
    expect(screen.getByRole("log").textContent).not.toContain("I wave.");
  });
});

describe("Transcript window", () => {
  const window500 = (from: number): TranscriptMessage[] => Array.from({ length: 500 }, (_, k) => ({ role: (from + k) % 2 ? "player" : "narrator", text: `entry ${from + k}`, seq: from + k }));
  it("when the server's 500-entry window slides, the new entries appear once, the kept ones are not re-rendered, and a repeated poll changes nothing", () => {
    const view = renderWithProviders(<Transcript messages={window500(0)} playerName="Nicco" pending={null} contentVersion="1" />);
    const kept = screen.getAllByRole("article")[300]!;
    expect(kept.textContent).toContain("entry 300");
    view.rerender(<Transcript messages={window500(2)} playerName="Nicco" pending={null} contentVersion="2" />);
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(500);
    expect(articles.slice(-2).map(a => a.textContent!.replace(/^(Nicco|Narrator)/, ""))).toEqual(["entry 500", "entry 501"]);
    expect(articles[298]).toBe(kept); // entry 300 is now at index 298: the same DOM node, keyed by its stable position
    view.rerender(<Transcript messages={window500(2)} playerName="Nicco" pending={null} contentVersion="2" />);
    expect(screen.getAllByRole("article")[298]).toBe(kept);
    expect(screen.queryByText("entry 0")).toBeNull();
  });
  it("a payload without positions still renders in order", () => {
    renderWithProviders(<Transcript messages={[{ role: "narrator", text: "one" }, { role: "player", text: "two" }]} playerName="Nicco" pending={null} contentVersion="1" />);
    expect(screen.getAllByRole("article").map(a => a.textContent)).toEqual(["Narratorone", "Niccotwo"]);
  });
});
