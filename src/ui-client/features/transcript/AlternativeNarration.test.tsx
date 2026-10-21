import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Transcript } from "./Transcript";
import type { AlternateModelDto, TranscriptMessage } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeSession } from "../../test/fixtures";
import { json, renderWithProviders } from "../../test/render";

/** Narrator comparison: a developer aid that never changes the story. Only the button calls the (paid) provider. */
const server = useFakeServer();
const models: AlternateModelDto[] = [{ id: "m/one", label: "Model one" }, { id: "m/two", label: "Model two" }];
const messages = (alternatives: NonNullable<TranscriptMessage["alternatives"]> = []): TranscriptMessage[] => [
  { role: "narrator", text: "Opening", seq: 0 },
  { role: "player", text: "Action", seq: 1 },
  { role: "narrator", text: "Original", seq: 2, comparison_id: "turn-1", comparison_available: true, alternatives },
];
const mount = (alternatives?: NonNullable<TranscriptMessage["alternatives"]>) => renderWithProviders(<Transcript messages={messages(alternatives)} playerName="Nicco" pending={null} contentVersion="1" alternateModels={models} />, { session: makeSession() });

describe("AlternativeNarration", () => {
  it("offers the control only on the finalized eligible narrator message, with every configured model, and sends nothing until the button", async () => {
    mount();
    expect(screen.getAllByText("Compare with another model")).toHaveLength(1);
    const select = screen.getByLabelText("Model for the comparison") as HTMLSelectElement;
    expect([...select.options].slice(1).map(o => o.value)).toEqual(["m/one", "m/two"]);
    expect(screen.getByRole("button", { name: "Generate comparison" })).toBeDisabled();
    expect(server.requests).toHaveLength(0);
  });

  it("generating sends only the comparison id and the model, disables the controls meanwhile, and leaves the canonical text as it was", async () => {
    let finish!: () => void;
    server.handlers["/api/alternative"] = async () => { await new Promise<void>(resolve => { finish = resolve; }); return json({ ok: true, alternatives: [{ label: "Model one", model: "m/one", text: "*Alternative action.*\n\n<script>inert</script>" }] }); };
    mount();
    await userEvent.selectOptions(screen.getByLabelText("Model for the comparison"), "m/one");
    await userEvent.click(screen.getByRole("button", { name: "Generate comparison" }));
    expect(await screen.findByRole("button", { name: "Generating…" })).toBeDisabled();
    expect(screen.getByLabelText("Model for the comparison")).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate comparison" })).toBeEnabled());
    expect(server.requests.find(r => r.url === "/api/alternative")?.body).toEqual({ message_id: "turn-1", model: "m/one" });
    expect(screen.getAllByRole("article").at(-1)!.textContent).toContain("Original");
  });

  it("shows each alternative the server holds as comparison only, stacked per model, with its text inert", () => {
    mount([{ label: "Model one", model: "m/one", text: "*Alternative action.*\n\n<script>inert</script>" }, { label: "Model two", model: "m/two", text: "Second telling." }]);
    const one = screen.getByRole("region", { name: "Alternative narration by Model one" }), two = screen.getByRole("region", { name: "Alternative narration by Model two" });
    expect(one.textContent).toMatch(/Alternative · Model one/);
    expect(one.textContent).toMatch(/Comparison only · Does not change the story/);
    expect(one.textContent).toContain("<script>inert</script>");
    expect(one.querySelector("script")).toBeNull();
    expect(within(two).getByText("Second telling.")).toBeTruthy();
    expect(screen.getAllByRole("article").at(-1)!.textContent).toContain("Original");
  });

  it("a failed comparison shows fixed copy with at most the closed failure class (never provider text) and leaves the alternatives and the story alone", async () => {
    server.handlers["/api/alternative"] = () => json({ ok: false, error: "PRIVATE_KEY_AND_REQUEST", failure_code: "timeout" }, 422);
    mount([{ label: "Model two", model: "m/two", text: "Second telling." }]);
    await userEvent.selectOptions(screen.getByLabelText("Model for the comparison"), "m/one");
    await userEvent.click(screen.getByRole("button", { name: "Generate comparison" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Alternative failed (timeout). Choose the model again to retry.");
    expect(document.body.textContent).not.toContain("PRIVATE");
    expect(screen.getAllByRole("region", { name: /Alternative narration by/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Generate comparison" })).toBeEnabled();
  });

  it("messages the server has not marked comparable offer nothing, and the opening never does", () => {
    renderWithProviders(<Transcript messages={[{ role: "narrator", text: "Opening", seq: 0 }, { role: "narrator", text: "Later", seq: 1, comparison_id: "turn-2", comparison_available: false }]} playerName="Nicco" pending={null} contentVersion="1" alternateModels={models} />, { session: makeSession() });
    expect(screen.queryByText("Compare with another model")).toBeNull();
  });
});
