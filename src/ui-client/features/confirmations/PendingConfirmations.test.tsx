import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PendingConfirmations } from "./PendingConfirmations";
import type { ConfirmationCardDto, ConfirmationViewDto } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeSession } from "../../test/fixtures";
import { json, renderWithProviders } from "../../test/render";

/** The generic confirmation card against a stubbed server: what Confirm and Cancel send, and what a refusal or an outcome leaves on screen. */
const server = useFakeServer();
const REF = "b".repeat(24);
const card = (extra: Partial<ConfirmationCardDto> = {}): ConfirmationCardDto => ({ ref: REF, title: "Free Maren?", body: "Nicco's words describe freeing Maren. Nothing has changed yet.", confirm_label: "Free Maren", cancel_label: "Keep as is", ...extra });
const view = (cards: ConfirmationCardDto[], recent: ConfirmationViewDto["recent"] = []): ConfirmationViewDto => ({ cards, recent });
const mount = (v: ConfirmationViewDto, blockedReason: string | null = null) => renderWithProviders(<PendingConfirmations view={v} blockedReason={blockedReason} />, { session: makeSession({ confirmations: v }) });

describe("PendingConfirmations (server interaction)", () => {
  it("shows a meaningful question, body and two verbs, and renders nothing when there is nothing to confirm", () => {
    const { container, rerender } = mount(view([card()]));
    expect(screen.getByRole("group", { name: "Free Maren?" })).toBeTruthy();
    expect(screen.getByText(/Nothing has changed yet/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Confirm: Free Maren" }).textContent).toBe("Free Maren");
    expect(screen.getByRole("button", { name: "Cancel: Free Maren? Keep as is" }).textContent).toBe("Keep as is");
    rerender(<PendingConfirmations view={view([])} blockedReason={null} />);
    expect(container.textContent).toBe("");
  });

  it("Confirm and Cancel post ONLY the opaque ref and the rendered revision", async () => {
    server.handlers["/api/confirmation/confirm"] = () => json({ ok: true, ...makeSession({ revision: 8 }) });
    server.handlers["/api/confirmation/cancel"] = () => json({ ok: true, ...makeSession({ revision: 7 }) });
    mount(view([card()]));
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Free Maren" }));
    await waitFor(() => expect(server.requests.some(r => r.url === "/api/confirmation/confirm")).toBe(true));
    expect(server.requests.find(r => r.url === "/api/confirmation/confirm")!.body).toEqual({ ref: REF, expected_revision: 7 });
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel: Free Maren? Keep as is" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Cancel: Free Maren? Keep as is" }));
    await waitFor(() => expect(server.requests.some(r => r.url === "/api/confirmation/cancel")).toBe(true));
    const cancel = server.requests.find(r => r.url === "/api/confirmation/cancel")!.body!;
    expect(cancel).toEqual({ ref: REF, expected_revision: 8 }); // the revision the page rendered after the first answer
    expect(Object.keys(cancel).sort()).toEqual(["expected_revision", "ref"]);
  });

  it("a stale or invalidated request shows its safe reason inline and leaves the card; a later outcome notice replaces a vanished card", async () => {
    const standing = makeSession({ revision: 9, confirmations: view([card()]) });
    server.handlers["/api/confirmation/confirm"] = () => json({ ok: false, error: { code: "stale_turn", message: "The campaign changed since this card was shown. Review the story and try again." }, ...standing }, 409);
    const { rerender } = mount(view([card()]));
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Free Maren" }));
    expect(await screen.findByText(/campaign changed since this card was shown/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Free Maren?" })).toBeTruthy();
    rerender(<PendingConfirmations view={view([], [{ ref: REF, status: "invalidated", subject_label: "Maren", text: "No longer applicable: the person's legal status has changed." }])} blockedReason={null} />);
    expect(screen.getByText(/Maren: No longer applicable/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Free Maren?" })).toBeNull();
  });

  it("buttons are disabled while a turn runs, and a card's text is inert (never markup)", () => {
    mount(view([card({ title: "<img src=x onerror=alert(1)>?" })]), "Available when the narrator finishes.");
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
    expect(document.body.textContent).toContain("<img src=x onerror=alert(1)>?");
    expect(document.querySelector("img")).toBeNull();
  });

  it("announces a new card once through the page announcer, not again on a re-render", async () => {
    const { rerender } = mount(view([card()]));
    const live = () => [...document.querySelectorAll("[aria-live]")].map(e => e.textContent).join("|");
    await waitFor(() => expect(live()).toContain("Needs your confirmation: Free Maren?"));
    rerender(<PendingConfirmations view={view([card()])} blockedReason={null} />);
    expect(live().split("Needs your confirmation: Free Maren?").length - 1).toBe(1);
  });
});
