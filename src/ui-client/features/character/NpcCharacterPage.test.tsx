import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import type { ActiveSessionPayload, CharacterCardDto } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeCapabilities, makeGalleryItem, makeNpcPlus, makePortrait, makeSession } from "../../test/fixtures";
import { json, renderRoutes } from "../../test/render";

const server = useFakeServer();
const card = () => makeNpcPlus();
const path = (ref = card().ref) => `/play/campaign_test/characters/${ref}`;
const withCard = (c: CharacterCardDto, revision = 7): ActiveSessionPayload => {
  const base = makeSession({ revision });
  return { ...base, play: { ...base.play, household: [{ members: [c] }] } };
};
const open = async (session: ActiveSessionPayload, at = path()) => {
  server.handlers["/api/session"] = () => json(session);
  return renderRoutes(routes, at);
};

describe("NPC+ editor page", () => {
  it("renders the engine's identity lines and fields and links back to the household", async () => {
    await open(withCard(card()));
    expect(await screen.findByRole("heading", { level: 1, name: "Maren" })).toBeTruthy();
    expect(screen.getByText("human")).toBeTruthy();
    expect((screen.getByLabelText(/^Height/) as HTMLInputElement).value).toBe("165");
    expect(screen.getByText(/A slim woman with ash-grey hair\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to the household/ }).getAttribute("href")).toBe("/play/campaign_test/household");
  });

  it("saves only the changed field, addressed by the opaque ref and carrying expected_revision, and shows the returned value", async () => {
    const box = { current: withCard(card()) };
    server.handlers["/api/session"] = () => json(box.current);
    server.handlers["/api/appearance"] = (_u, body) => {
      box.current = withCard(makeNpcPlus({}, makePortrait(), { fields: card().appearance_editor!.fields.map(f => f.key === "hair_color" ? { ...f, override: String((body?.patch as Record<string, unknown>).hair_color) } : f) }), 8);
      return json({ ok: true, changed: true, ...box.current });
    };
    renderRoutes(routes, path());
    const hair = await screen.findByLabelText("Hair color");
    const user = userEvent.setup();
    await user.type(hair, "silver");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByDisplayValue("silver");
    const sent = server.requests.find(r => r.url === "/api/appearance");
    expect(sent?.body).toEqual({ ref: card().ref, expected_revision: 7, patch: { hair_color: "silver" } });
  });

  it("shows a server refusal on the page and keeps the typed value", async () => {
    server.handlers["/api/appearance"] = () => json({ error: { code: "invalid_field", message: "Hair color is too long." } }, 400);
    await open(withCard(card()));
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Hair color"), "x");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText(/Hair color is too long\./)).toBeTruthy();
    expect((screen.getByLabelText("Hair color") as HTMLInputElement).value).toBe("x");
  });

  it("is read-only with the engine's reason when the character cannot be edited, and has no save or generation controls", async () => {
    const locked = makeNpcPlus({ character_capabilities: makeCapabilities({ tier: "npc_plus", can_edit_npc_plus: false, edit_unavailable_reason: "Maren is not in your household." }), appearance_editor: null });
    await open(withCard(locked));
    expect(await screen.findByText("Maren is not in your household.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.queryByRole("button", { name: /generate/i })).toBeNull();
  });

  it("says so for a ref the read model does not list", async () => {
    await open(withCard(card()), path("0000000000000000deadbeef"));
    expect(await screen.findByText(/nothing to edit/)).toBeTruthy();
  });

  it("makes no image-generation request on its own: portraits only change after a deliberate click", async () => {
    const portrait = makePortrait({ gallery: [makeGalleryItem({ token: "n1", url: "/api/portrait/asset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1" })] });
    await open(withCard(makeNpcPlus({}, portrait)));
    await screen.findByRole("heading", { level: 1, name: "Maren" });
    expect(server.requests.filter(r => r.method === "POST")).toEqual([]);
  });
  it("NPC+ image generation has the same lifecycle as the player's: one explicit click sends ref + revision + kind + pose, shows progress and placeholders, then the Gallery follows the server", async () => {
    let finish!: () => void;
    let current = withCard(makeNpcPlus({}, makePortrait()));
    server.handlers["/api/session"] = () => json(current);
    server.handlers["/api/portrait/generate"] = async () => {
      await new Promise<void>(resolve => { finish = resolve; });
      current = withCard(makeNpcPlus({}, makePortrait({ gallery: [makeGalleryItem({ token: "n1" }), makeGalleryItem({ token: "n2", url: "/api/portrait/asset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2" }), makeGalleryItem({ token: "n3", url: "/api/portrait/asset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3" })] })), 8);
      return json({ ok: true, changed: true, message: "3 avatar options added.", ...current });
    };
    renderRoutes(routes, path());
    await screen.findByRole("heading", { level: 1, name: "Maren" });
    await userEvent.click(screen.getByRole("button", { name: "Generate 3 avatars" }));
    expect(await screen.findByText("Generating 3 avatar images")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate 3 full-body images" })).toBeDisabled();
    expect(screen.getAllByText(/Avatar \d of 3…/).length).toBe(3);
    const posts = server.requests.filter(r => r.url === "/api/portrait/generate");
    expect(posts).toHaveLength(1);
    expect(Object.keys(posts[0]!.body!).sort()).toEqual(["expected_revision", "kind", "pose", "ref"]);
    expect(posts[0]!.body).toMatchObject({ ref: card().ref, expected_revision: 7, kind: "avatar" });
    finish();
    await screen.findAllByRole("button", { name: /^View portrait/ });
    expect(screen.queryByText("Generating 3 avatar images")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^View portrait/ })).toHaveLength(3);
  });
});
