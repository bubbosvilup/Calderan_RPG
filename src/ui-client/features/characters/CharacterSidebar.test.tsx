import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CharacterSidebar } from "./CharacterSidebar";
import { CharacterDrawer } from "./CharacterDrawer";
import { makeCapabilities, makeCard, makeSession } from "../../test/fixtures";
import { renderWithProviders } from "../../test/render";

const unknown = makeCard({ ref: "f00d0000000000000000000b", name: "Red-haired woman", name_known: false, category: "Met this campaign · name unknown",
  character_capabilities: makeCapabilities({ tier: "campaign_npc", promotion_unavailable_reason: "Not at the Heartstone." }) });

describe("CharacterSidebar", () => {
  it("lists the player as a link to the character page and other people as buttons, with player-safe names and no internal refs", async () => {
    const session = makeSession();
    const onOpen = vi.fn();
    renderWithProviders(<CharacterSidebar session={{ ...session, play: { ...session.play, participants: [...session.play.participants, { ref: unknown.ref, name: unknown.name, name_known: false, category: unknown.category, household: false, npc_plus: false, card: unknown }] } }} onOpenCharacter={onOpen} blockedReason={null} />);
    const scene = screen.getByRole("region", { name: "In the scene" });
    expect(within(scene).queryByRole("button", { name: /Nicco/ })).toBeNull();
    expect(within(scene).getByRole("link", { name: /Nicco/ }).getAttribute("href")).toBe("/play/campaign_test/character/player");
    expect(scene.textContent).not.toMatch(/c0ffee|f00d/);
    await userEvent.click(within(scene).getByRole("button", { name: /Red-haired woman/ }));
    expect(onOpen).toHaveBeenCalledWith(unknown.ref);
  });
  it("offers Keep track only as the engine's keepable flag allows", () => {
    const session = makeSession({ provisional: { people: [{ token: "t1", label: "Guard (1)", held: false, keepable: true }, { token: "t2", label: "Guard (2)", held: false, keepable: false, reason: "Two present people share this name." }] } });
    renderWithProviders(<CharacterSidebar session={session} onOpenCharacter={() => undefined} blockedReason={null} />);
    expect(screen.getByRole("button", { name: "Keep track of Guard (1)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Keep track of Guard (2)" })).toBeDisabled();
    expect(screen.getByText("Two present people share this name.")).toBeTruthy();
  });
});

describe("CharacterDrawer", () => {
  it("renders Promote only from the capability flag, and its first click only opens the confirmation", async () => {
    const eligible = makeCard({ name: "Maren", character_capabilities: makeCapabilities({ tier: "campaign_npc", can_promote_to_npc_plus: true }) });
    const { rerender } = renderWithProviders(<CharacterDrawer card={unknown} playerName="Nicco" onClose={() => undefined} blockedReason={null} />);
    expect(screen.queryByRole("button", { name: /Promote/ })).toBeNull();
    rerender(<CharacterDrawer card={eligible} playerName="Nicco" onClose={() => undefined} blockedReason={null} />);
    await userEvent.click(screen.getByRole("button", { name: "Promote Maren to NPC+" }));
    expect(screen.getByRole("group", { name: "Promote Maren to NPC+?" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Confirm: Promote" }));
  });
  it("is a labelled modal dialog that closes on Escape and returns focus to its opener", async () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { rerender } = renderWithProviders(<CharacterDrawer card={makeCard()} playerName="Nicco" onClose={onClose} blockedReason={null} />);
    const dialog = screen.getByRole("dialog", { name: "Korvin" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<CharacterDrawer card={null} playerName="Nicco" onClose={onClose} blockedReason={null} />);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
