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
