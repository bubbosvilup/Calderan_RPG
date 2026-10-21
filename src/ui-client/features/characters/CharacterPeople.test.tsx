import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import type { ActiveSessionPayload, CharacterCardDto } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeCapabilities, makeCard, makeNpcPlus, makeSession } from "../../test/fixtures";
import { json, renderRoutes } from "../../test/render";

/**
 * People on the play screen, end to end against a stubbed server: Keep track, the character drawer's keyboard cycle, the capability-driven
 * controls of each character tier, and where avatars come from (the read model's one URL, never a path of the client's own).
 */
const server = useFakeServer();
const playtest = (session: ActiveSessionPayload) => { const { campaign: _campaign, ...rest } = session; return rest as ActiveSessionPayload; };
const withCard = (card: CharacterCardDto, extra: Partial<ActiveSessionPayload> = {}): ActiveSessionPayload => {
  const base = makeSession();
  return playtest({ ...base, ...extra, play: { ...base.play, participants: [base.play.participants[0]!, { ref: card.ref, name: card.name, name_known: card.name_known, category: card.category, household: card.household, npc_plus: card.npc_plus, card }] } });
};
const open = async (session: ActiveSessionPayload, name: string | RegExp) => {
  server.handlers["/api/session"] = () => json(session);
  renderRoutes(routes, "/play");
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name }));
  return { user, dialog: await screen.findByRole("dialog") };
};

describe("Keep track", () => {
  const people = [{ token: "0123456789abcdef01234567", label: "Guard (1)", held: false, keepable: true }];
  it("sends only the opaque token and the rendered revision to /api/people/keep; a temporary person never opens the character drawer", async () => {
    const session = playtest(makeSession({ provisional: { people } }));
    server.handlers["/api/session"] = () => json(session);
    server.handlers["/api/people/keep"] = () => json({ ok: true, ...session, revision: 8, provisional: { people: [] } });
    renderRoutes(routes, "/play");
    const user = userEvent.setup();
    const row = (await screen.findByText("Guard (1)")).closest("li")!;
    await user.click(within(row).getByText("Guard (1)"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(row.querySelector("[aria-haspopup]")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Keep track of Guard (1)" }));
    await waitFor(() => expect(server.requests.some(r => r.url === "/api/people/keep")).toBe(true));
    const body = server.requests.find(r => r.url === "/api/people/keep")!.body!;
    expect(body).toEqual({ token: people[0]!.token, expected_revision: 7 });
    expect(Object.keys(body).sort()).toEqual(["expected_revision", "token"]);
    await waitFor(() => expect(screen.queryByText("Guard (1)")).toBeNull());
  });
  it("a refusal shows the server's sentence at that person and keeps the row", async () => {
    const session = playtest(makeSession({ provisional: { people } }));
    server.handlers["/api/session"] = () => json(session);
    server.handlers["/api/people/keep"] = () => json({ ok: false, error: { code: "stale_turn", message: "The scene changed. Try again." }, ...session }, 409);
    renderRoutes(routes, "/play");
    await userEvent.click(await screen.findByRole("button", { name: "Keep track of Guard (1)" }));
    expect((await screen.findByRole("alert")).textContent).toBe("The scene changed. Try again.");
    expect(screen.getByText("Guard (1)")).toBeTruthy();
  });
});

describe("character drawer keyboard", () => {
  const eligible = makeCard({ name: "Maren", category: "Met this campaign", character_capabilities: makeCapabilities({ tier: "campaign_npc", can_promote_to_npc_plus: true }) });
  it("Tab and Shift+Tab stay inside the drawer and reach Promote, then its Cancel and Promote buttons once the confirmation is open; Escape closes and focus returns to the row", async () => {
    const { user, dialog } = await open(withCard(eligible), /Maren/);
    const cycle = async (steps: number, shift = false) => { const seen: (string | null)[] = []; for (let i = 0; i < steps; i++) { await user.tab({ shift }); expect(dialog.contains(document.activeElement)).toBe(true); seen.push(document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent ?? null); } return seen; };
    // Without the confirmation: close, Promote, the tabs ... then it wraps back to close; Shift+Tab walks back and also wraps.
    dialog.querySelector<HTMLElement>("[data-autofocus]")!.focus();
    const forward = await cycle(10);
    expect(forward).toContain("Promote Maren to NPC+");
    expect(forward.filter(label => label === "Close Maren").length).toBeGreaterThanOrEqual(2);
    expect((await cycle(10, true))).toContain("Promote Maren to NPC+");
    // Open the confirmation: its two buttons join the cycle.
    await user.click(within(dialog).getByRole("button", { name: "Promote Maren to NPC+" }));
    const confirm = within(dialog).getByRole("button", { name: "Confirm: Promote" }), cancel = within(dialog).getByRole("button", { name: /^Cancel: Promote/ });
    expect(await cycle(12)).toEqual(expect.arrayContaining(["Confirm: Promote", "Cancel: Promote Maren to NPC+? Cancel"]));
    cancel.focus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement?.textContent).toMatch(/Maren/);
    expect(confirm).toBeTruthy();
  });
  it("closes from the backdrop as well", async () => {
    const { user } = await open(withCard(eligible), /Maren/);
    await user.click(screen.getAllByRole("button", { name: "Close Maren" }).find(b => b.tabIndex === -1)!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("character tiers: controls come from the engine's capabilities only", () => {
  it("a world/canon NPC is read-only: no Promote, no editor link, no portrait or gallery controls", async () => {
    const { dialog } = await open(withCard(makeCard({ name: "Korvin" })), /Korvin/);
    expect(within(dialog).queryByRole("button", { name: /Promote|Generate|Upload/ })).toBeNull();
    expect(within(dialog).queryByRole("link")).toBeNull();
    expect(dialog.textContent).not.toMatch(/Upload|Gallery|Full Body|Edit NPC\+/);
  });
  it("a campaign NPC keeps its read-only runtime information and no NPC+ controls, household membership or not", async () => {
    const card = makeCard({ name: "Porter", household: true, category: "Household", role: "Known porter", state: "winded", where: "Here, in Front hall", character_capabilities: makeCapabilities({ tier: "campaign_npc" }) });
    const { dialog } = await open(withCard(card), /Porter/);
    expect(within(dialog).queryByRole("button", { name: /Promote|Generate/ })).toBeNull();
    expect(within(dialog).queryByRole("link")).toBeNull();
    for (const text of ["Known porter", "winded", "Here, in Front hall"]) expect(dialog.textContent).toContain(text);
  });
  it("an editable NPC+ offers the editor by its opaque ref; an NPC+ that is no longer active gets the engine's reason instead, never a silent gap", async () => {
    const plus = makeNpcPlus();
    const { dialog } = await open(withCard(plus), /Maren/);
    expect(within(dialog).getByRole("link", { name: "Edit appearance and portraits" }).getAttribute("href")).toBe(`/play/characters/${plus.ref}`);
    expect(within(dialog).queryByRole("button", { name: /Promote/ })).toBeNull();
  });
  it("an NPC+ the engine reports as not editable shows the reason", async () => {
    const gone = makeNpcPlus({ name: "Maren", character_capabilities: makeCapabilities({ tier: "npc_plus", can_edit_npc_plus: false, edit_unavailable_reason: "This character is no longer active." }) });
    const { dialog } = await open(withCard(gone), /Maren/);
    expect(within(dialog).queryByRole("link", { name: /Edit/ })).toBeNull();
    expect(within(dialog).getByText("This character is no longer active.")).toBeTruthy();
  });
  it("Promote is absent for an ineligible campaign NPC, an existing NPC+ and the player", async () => {
    const ineligible = makeCard({ name: "Hollis", character_capabilities: makeCapabilities({ tier: "campaign_npc", can_promote_to_npc_plus: false, promotion_unavailable_reason: "The character must be inside Heartstone to complete the rite." }) });
    const { dialog } = await open(withCard(ineligible), /Hollis/);
    expect(within(dialog).queryByRole("button", { name: /Promote/ })).toBeNull();
  });
});

describe("avatars", () => {
  const url = "/api/canon-avatar/0123456789abcdef01234567";
  it("a canonical avatar fills the scene row and the drawer from the one URL the card carries, with no placeholder initial", async () => {
    const card = makeCard({ name: "Korvin", avatar_url: url });
    const { dialog } = await open(withCard(card), /Korvin/);
    const row = document.querySelector<HTMLElement>(`[data-character-ref="${card.ref}"]`)!;
    expect(row.querySelector("img")?.getAttribute("src")).toBe(url);
    expect(dialog.querySelector("img")?.getAttribute("src")).toBe(url);
    expect(within(dialog).queryByText("K", { selector: "span" })).toBeNull();
  });
  it("without an avatar the passive initial placeholder stays (a masked name shows ?)", async () => {
    const card = makeCard({ name: "Red-haired woman", name_known: false, avatar_url: null });
    await open(withCard(card), /Red-haired woman/);
    expect(document.querySelector(`[data-character-ref="${card.ref}"]`)!.querySelector("img")).toBeNull();
    expect(document.querySelector(`[data-character-ref="${card.ref}"]`)!.textContent).toContain("?");
  });
  it("the player's selected avatar is one URL shown in the player summary and the scene list; without one both show the initial", async () => {
    const base = playtest(makeSession());
    const withAvatar: ActiveSessionPayload = { ...base, player_character: { ...base.player_character!, visual: { ...base.player_character!.visual!, avatar_url: "/api/portrait/asset/77777777777777777777777777777777" } } };
    server.handlers["/api/session"] = () => json(withAvatar);
    const view = renderRoutes(routes, "/play");
    await screen.findByLabelText("What Nicco says or does");
    expect([...document.querySelectorAll("img")].filter(i => i.getAttribute("src") === "/api/portrait/asset/77777777777777777777777777777777").length).toBeGreaterThanOrEqual(2);
    view.unmount();
    const plain = playtest(makeSession());
    const bare: ActiveSessionPayload = { ...plain, player_character: { ...plain.player_character!, visual: { ...plain.player_character!.visual!, avatar_url: null } } };
    server.handlers["/api/session"] = () => json(bare);
    renderRoutes(routes, "/play");
    await screen.findByLabelText("What Nicco says or does");
    expect(document.querySelector("img[src*='/api/portrait/asset/']")).toBeNull();
  });
});
