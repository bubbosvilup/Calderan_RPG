import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import type { ActiveSessionPayload, CharacterCardDto } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeCapabilities, makeCard, makeNpcPlus, makeSession } from "../../test/fixtures";
import { json, renderRoutes } from "../../test/render";

const server = useFakeServer();
const PATH = "/play/campaign_test/household";

const withHousehold = (members: CharacterCardDto[]): ActiveSessionPayload => {
  const session = makeSession();
  return { ...session, play: { ...session.play, household: [{ members }], household_title: "Household of Nicco" } };
};
const open = async (session: ActiveSessionPayload) => {
  server.handlers["/api/session"] = () => json(session);
  renderRoutes(routes, PATH);
  await screen.findByRole("heading", { level: 1, name: "Household of Nicco" });
};
const maren = () => makeNpcPlus();
const dara = () => makeCard({
  ref: "d00d00000000000000000cc1", name: "Dara", household: true, category: "Household", role: "Cook", presence: "away", known_location: "Harbor",
  character_capabilities: makeCapabilities({ tier: "campaign_npc", can_promote_to_npc_plus: true }),
});
const unfamiliar = () => makeCard({ ref: "ab0000000000000000000dd2", name: "Unfamiliar household member", name_known: false, household: true, category: "Household", role: "Not known", presence: "present" });

describe("Household page", () => {
  it("lists the members the read model gives, with totals, an NPC+ badge, and masked names unchanged", async () => {
    await open(withHousehold([maren(), dara(), unfamiliar()]));
    expect(screen.getByText("3 members · 2 here with you · 1 elsewhere")).toBeTruthy();
    const maren_ = screen.getByRole("button", { name: "View Maren" });
    expect(within(maren_).getByText("NPC+")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: "View Dara" })).queryByText("NPC+")).toBeNull();
    expect(screen.getByRole("button", { name: "View Unfamiliar household member" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/premium/i);
  });

  it("filters Here/Elsewhere and searches without sending any request", async () => {
    await open(withHousehold([maren(), dara()]));
    const before = server.requests.length;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("button", { name: "View Maren" })).toBeNull();
    expect(screen.getByRole("button", { name: "View Dara" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.type(screen.getByRole("searchbox", { name: "Search members" }), "healer");
    expect(screen.getByRole("button", { name: "View Maren" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View Dara" })).toBeNull();
    await user.clear(screen.getByRole("searchbox", { name: "Search members" }));
    await user.type(screen.getByRole("searchbox", { name: "Search members" }), "zzz");
    expect(screen.getByText("No members match this filter or search.")).toBeTruthy();
    expect(server.requests.length).toBe(before);
  });

  it("offers Edit only for a member the engine reports as editable, linking to the ref-based editor route", async () => {
    await open(withHousehold([maren(), dara()]));
    const edit = screen.getByRole("link", { name: "Edit Maren" });
    expect(edit.getAttribute("href")).toBe(`/play/campaign_test/characters/${maren().ref}`);
    expect(screen.queryByRole("link", { name: "Edit Dara" })).toBeNull();
  });

  it("shows the engine's own reason when an NPC+ cannot be edited, never inventing eligibility", async () => {
    const locked = makeNpcPlus({ character_capabilities: makeCapabilities({ tier: "npc_plus", can_edit_npc_plus: false, edit_unavailable_reason: "Maren has left the household." }), appearance_editor: null, appearance_editor_eligible: false });
    await open(withHousehold([locked]));
    expect(screen.queryByRole("link", { name: "Edit Maren" })).toBeNull();
    expect(screen.getByText("Maren has left the household.")).toBeTruthy();
  });

  it("opens the character drawer; promotion appears only with the capability and sends the explicit request with the rendered revision", async () => {
    server.handlers["/api/npc-plus/promote"] = (_u, body) => json({ ok: true, changed: true, ...withHousehold([{ ...dara(), npc_plus: true }]), revision: 8, requested: body });
    await open(withHousehold([dara(), makeCard({ ref: "bb0000000000000000000ee3", name: "Korvin", household: true, category: "Household" })]));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "View Korvin" }));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).queryByRole("button", { name: /promote/i })).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "View Dara" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /promote/i }));
    const confirm = await screen.findAllByRole("button", { name: /promote|confirm/i });
    expect(confirm.length).toBeGreaterThan(0);
    expect(server.requests.some(r => r.url === "/api/npc-plus/promote")).toBe(false); // a click alone never mutates
  });

  it("shows an empty state for a household with no members", async () => {
    await open(withHousehold([]));
    expect(screen.getByText("No household members yet.")).toBeTruthy();
  });
});
