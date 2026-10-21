import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import type { ActiveSessionPayload, PortraitGalleryItemDto } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeGalleryItem, makePlayerCharacter, makePortrait, makeSession } from "../../test/fixtures";
import { json, renderRoutes } from "../../test/render";

const server = useFakeServer();
const PATH = "/play/campaign_test/character/player";

const gallery = (): PortraitGalleryItemDto[] => [
  makeGalleryItem({ token: "g1", url: "/api/portrait/asset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1", is_avatar: true }),
  makeGalleryItem({ token: "g2", url: "/api/portrait/asset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2", kind: "fullbody", can_be_avatar: false, can_be_full_body: true, pose_label: "Standing" }),
  makeGalleryItem({ token: "g3", url: "/api/portrait/asset/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa3", stale: true }),
];
const withGallery = (items = gallery(), revision = 7): ActiveSessionPayload => {
  const avatar = items.find(i => i.is_avatar), full = items.find(i => i.is_full_body);
  const portrait = makePortrait({ gallery: items, avatar: avatar ? { url: avatar.url, stale: avatar.stale } : null, full_body: full ? { url: full.url, stale: full.stale } : null });
  return makeSession({ revision, player_character: makePlayerCharacter({}, portrait) });
};
const open = async (session: ActiveSessionPayload) => {
  server.handlers["/api/session"] = () => json(session);
  const view = renderRoutes(routes, PATH);
  await screen.findByRole("heading", { level: 1, name: "Nicco" });
  return view;
};
/** A stateful server for portrait actions: each handler mutates `current` and answers like the play server (ok + fresh state). */
function portraitServer(initial: ActiveSessionPayload) {
  const box = { current: initial };
  const respond = (extra: Record<string, unknown> = {}) => json({ ok: true, changed: true, ...extra, ...box.current });
  const portraitOf = () => box.current.player_character!.visual!.editor.portrait;
  const update = (items: PortraitGalleryItemDto[]) => {
    const avatar = items.find(i => i.is_avatar), full = items.find(i => i.is_full_body);
    box.current = withGallery(items, box.current.revision + 1);
    void avatar; void full;
  };
  server.handlers["/api/session"] = () => json(box.current);
  server.handlers["/api/portrait/avatar"] = (_u, body) => { update(portraitOf().gallery.map(i => ({ ...i, is_avatar: i.token === body?.item }))); return respond(); };
  server.handlers["/api/portrait/full-body"] = (_u, body) => { update(portraitOf().gallery.map(i => ({ ...i, is_full_body: i.token === body?.item }))); return respond(); };
  server.handlers["/api/portrait/delete"] = (_u, body) => { update(portraitOf().gallery.filter(i => i.token !== body?.item)); return respond(); };
  return box;
}

describe("Player character page", () => {
  it("UI2-4 renders the authoritative player: heading, role, gold, location, narrator summary, saved profile values and shortcuts", async () => {
    await open(makeSession());
    expect(screen.getByRole("heading", { level: 1, name: "Nicco" })).toBeTruthy();
    expect(screen.getAllByText("Player Character").length).toBeGreaterThan(0);
    expect(screen.getByTestId("character-gold").textContent).toBe("500");
    expect(screen.getByText("Slave market")).toBeTruthy();
    expect(screen.getByText("A young man with dark hair.")).toBeTruthy();
    expect((screen.getByLabelText("Sex") as HTMLInputElement).value).toBe("male");
    expect((screen.getByLabelText(/^Height/) as HTMLInputElement).value).toBe("178");
    expect((screen.getByLabelText("Build") as HTMLInputElement).value).toBe("");
    for (const heading of ["Details", "Profile and appearance", "Gallery"]) expect(screen.getByRole("heading", { level: 2, name: heading })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Campaign pages" });
    expect(within(nav).getByRole("link", { name: "Inventory" }).getAttribute("href")).toBe("/play/campaign_test/inventory");
    expect(within(nav).getByRole("link", { name: "Play" }).getAttribute("href")).toBe("/play/campaign_test");
    // nothing invented: no stats, classes, levels
    expect(document.body.textContent).not.toMatch(/\b(level|class|strength|dexterity|hit points|skill)\b/i);
  });

  it("UI2-5 appearance round trip: unsaved changes are indicated, Save sends only the changed fields, the server's values come back", async () => {
    const box = { current: makeSession() };
    server.handlers["/api/session"] = () => json(box.current);
    server.handlers["/api/player-character"] = (_u, body) => {
      const patch = body?.patch as Record<string, unknown>;
      const player = box.current.player_character!;
      box.current = { ...box.current, revision: box.current.revision + 1, player_character: { ...player, visual: { ...player.visual!, editor: { ...player.visual!.editor, fields: player.visual!.editor.fields.map(f => (f.key in patch ? { ...f, override: String(patch[f.key]) } : f)) } } } };
      return json({ ok: true, changed: true, ...box.current });
    };
    renderRoutes(routes, PATH);
    const build = await screen.findByLabelText("Build");
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    await userEvent.type(build, "  lean   and wiry ");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(screen.queryByText("Unsaved changes")).toBeNull());
    const post = server.requests.find(r => r.url === "/api/player-character")!;
    expect(post.body).toEqual({ expected_revision: 7, patch: { build: "lean and wiry" } });
    expect((screen.getByLabelText("Build") as HTMLInputElement).value).toBe("lean and wiry");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("clears a saved value with null, and does nothing for an emptied unsaved one", async () => {
    await open(makeSession());
    server.handlers["/api/player-character"] = () => json({ ok: true, changed: true, ...makeSession({ revision: 8 }) });
    await userEvent.clear(screen.getByLabelText("Hair color"));
    await userEvent.clear(screen.getByLabelText("Build"));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(server.requests.some(r => r.url === "/api/player-character")).toBe(true));
    expect(server.requests.find(r => r.url === "/api/player-character")!.body).toEqual({ expected_revision: 7, patch: { hair_color: null } });
  });

  it("a refused save keeps the typed text, shows the server's sentence at the field it named, and rejects non-numbers before sending", async () => {
    await open(makeSession());
    server.handlers["/api/player-character"] = () => json({ ok: false, error: { code: "invalid_input", message: "Height must be a plausible human height." }, field: "height_cm", ...makeSession() }, 422);
    const height = screen.getByLabelText(/^Height/);
    await userEvent.clear(height);
    await userEvent.type(height, "abc");
    expect(screen.getByText("Enter a whole number.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await userEvent.clear(height);
    await userEvent.type(height, "9999");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Height must be a plausible human height.")).toBeTruthy();
    expect(height.getAttribute("aria-invalid")).toBe("true");
    expect((height as HTMLInputElement).value).toBe("9999");
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect((screen.getByLabelText(/^Height/) as HTMLInputElement).value).toBe("178");
  });

  it("an identity edit (species) uses the same endpoint and sends only that key", async () => {
    await open(makeSession());
    server.handlers["/api/player-character"] = () => json({ ok: true, changed: true, ...makeSession({ revision: 8 }) });
    await userEvent.type(screen.getByLabelText("Species"), "Half-elf");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(server.requests.some(r => r.url === "/api/player-character")).toBe(true));
    expect(server.requests.find(r => r.url === "/api/player-character")!.body).toEqual({ expected_revision: 7, patch: { species: "Half-elf" } });
  });

  it("UI2-6 renders the Gallery: a thumbnail per image with alt text, roles, kind, count and the batch controls", async () => {
    await open(withGallery());
    const section = screen.getByRole("region", { name: "Gallery" });
    expect(within(section).getByText("3 of 64")).toBeTruthy();
    const thumbs = within(section).getAllByRole("button", { name: /^View portrait/ });
    expect(thumbs.map(t => t.getAttribute("aria-label"))).toEqual([
      "View portrait 1 of 3, Avatar image (Avatar)", "View portrait 2 of 3, Full-body image", "View portrait 3 of 3, Avatar image"]);
    const images = within(section).getAllByRole("img");
    expect(images.map(i => i.getAttribute("alt"))).toEqual(["Portrait 1 of 3", "Portrait 2 of 3", "Portrait 3 of 3"]);
    expect(images.every(i => i.getAttribute("loading") === "lazy")).toBe(true);
    expect(within(section).getByText("Older appearance")).toBeTruthy();
    expect(within(section).getByRole("button", { name: "Generate 3 avatars" })).toBeEnabled();
    expect(within(section).getByRole("button", { name: "Generate 3 full-body images" })).toBeEnabled();
    // a role held by an image is shown as pressed; a kind rule disables the other role
    expect(within(section).getByRole("button", { name: "Avatar (current)" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(section).getByRole("button", { name: "Set portrait 2 of 3 as Avatar".replace(" of 3", "") + " (not available for this image kind)" })).toBeDisabled();
  });

  it("UI2-7 a missing image shows a fallback instead of a broken picture, and an empty Gallery explains itself", async () => {
    await open(withGallery());
    const section = screen.getByRole("region", { name: "Gallery" });
    fireEvent.error(within(section).getAllByRole("img")[0]!);
    expect(within(section).getAllByText("Image unavailable").length).toBe(1);
    expect(within(section).getAllByRole("img").length).toBe(2);
  });

  it("an empty Gallery says how to start it", async () => {
    await open(makeSession());
    expect(screen.getByText(/No portraits yet\. Generate 3 avatars or 3 full-body images/)).toBeTruthy();
    expect(screen.getByText("No avatar yet", { selector: "figcaption" })).toBeTruthy();
    expect(screen.getByText("No full-body image selected.", { selector: "figcaption" })).toBeTruthy();
  });

  it("UI2-8/9/10 the lightbox opens on the clicked image, steps with buttons and arrow keys (wrapping), closes on Escape, and focus returns to the thumbnail", async () => {
    await open(withGallery());
    const thumb = screen.getByRole("button", { name: "View portrait 2 of 3, Full-body image" });
    await userEvent.click(thumb);
    const dialog = screen.getByRole("dialog", { name: "Portrait 2 of 3" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(within(dialog).getByText(/Full-body image · Pose: Standing · Generated 2026-10-14 10:00 UTC · Test model/)).toBeTruthy();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("dialog", { name: "Portrait 3 of 3" })).toBeTruthy();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("dialog", { name: "Portrait 1 of 3" })).toBeTruthy();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("dialog", { name: "Portrait 3 of 3" })).toBeTruthy();
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Previous portrait" }));
    expect(screen.getByRole("dialog", { name: "Portrait 2 of 3" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(thumb);
    // the close button and the backdrop also close it
    await userEvent.click(thumb);
    await userEvent.click(screen.getByRole("button", { name: "Close Portrait 2 of 3" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(thumb);
    await userEvent.click(thumb);
    await userEvent.click(document.querySelector<HTMLButtonElement>("button[tabindex='-1'][aria-hidden='true']")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a Gallery of one image shows no previous/next controls and ignores arrow keys", async () => {
    await open(withGallery([gallery()[0]!]));
    await userEvent.click(screen.getByRole("button", { name: /^View portrait 1 of 1/ }));
    const dialog = screen.getByRole("dialog", { name: "Portrait 1 of 1" });
    expect(within(dialog).queryByRole("button", { name: "Previous portrait" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Next portrait" })).toBeNull();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("dialog", { name: "Portrait 1 of 1" })).toBeTruthy();
  });

  it("the lightbox keeps Tab inside the dialog", async () => {
    await open(withGallery());
    await userEvent.click(screen.getByRole("button", { name: /^View portrait 1 of 3/ }));
    const dialog = screen.getByRole("dialog");
    for (let i = 0; i < 12; i++) { await userEvent.tab(); expect(dialog.contains(document.activeElement)).toBe(true); }
    for (let i = 0; i < 12; i++) { await userEvent.tab({ shift: true }); expect(dialog.contains(document.activeElement)).toBe(true); }
  });

  it("UI2-11 choosing Avatar / Full Body sends only the image token, and the roles come back from the server's state", async () => {
    portraitServer(withGallery());
    renderRoutes(routes, PATH);
    await screen.findByRole("heading", { level: 1, name: "Nicco" });
    const section = screen.getByRole("region", { name: "Gallery" });
    await userEvent.click(within(section).getByRole("button", { name: "Set portrait 2 as Full Body" }));
    await waitFor(() => expect(within(section).getByRole("button", { name: "Full Body (current)" })).toBeTruthy());
    const post = server.requests.find(r => r.url === "/api/portrait/full-body")!;
    expect(post.body).toEqual({ ref: "a1b2c3d4e5f6a1b2c3d4e5f6", expected_revision: 7, item: "g2" });
    expect(within(section).getAllByRole("button", { name: /^View portrait 2 of 3.*Full Body/ }).length).toBe(1);
    // choose the stale avatar-kind image 3 as the Avatar from the viewer
    await userEvent.click(within(section).getByRole("button", { name: /^View portrait 3 of 3/ }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Set as Avatar" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Avatar ✓" })).toBeDisabled());
    expect(server.requests.filter(r => r.url === "/api/portrait/avatar")[0]!.body).toEqual({ ref: "a1b2c3d4e5f6a1b2c3d4e5f6", expected_revision: 8, item: "g3" });
    // clearing the Full Body sends item: null
    await userEvent.keyboard("{Escape}");
    server.handlers["/api/portrait/full-body"] = () => json({ ok: true, changed: true, ...withGallery(gallery().map(i => ({ ...i, is_avatar: i.token === "g3" })), 10) });
    await userEvent.click(screen.getByRole("button", { name: "Clear Full Body" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Clear Full Body" })).toBeNull());
    expect(server.requests.filter(r => r.url === "/api/portrait/full-body").at(-1)!.body).toMatchObject({ item: null });
  });

  it("deleting asks for confirmation inside the viewer; a refusal shows the server's sentence; success closes the viewer and focus lands on the Gallery", async () => {
    const box = portraitServer(withGallery());
    renderRoutes(routes, PATH);
    await screen.findByRole("heading", { level: 1, name: "Nicco" });
    await userEvent.click(screen.getByRole("button", { name: /^View portrait 1 of 3/ }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(within(dialog).getByRole("alert").textContent).toMatch(/cannot be undone/);
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    await userEvent.keyboard("{Escape}"); // Escape dismisses the confirmation, not the viewer
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Delete" }));
    server.handlers["/api/portrait/delete"] = () => json({ ok: false, error: { code: "invalid_input", message: "Choose another Avatar before deleting this image." }, ...box.current }, 422);
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete image" }));
    expect(await within(dialog).findByText("Choose another Avatar before deleting this image.")).toBeTruthy();
    // delete image 3 (holds no role) from its own viewer
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    portraitServer(box.current);
    await userEvent.click(screen.getByRole("button", { name: /^View portrait 3 of 3/ }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete image" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getAllByRole("button", { name: /^View portrait/ })).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Gallery" }));
  });

  it("generation: busy state and placeholders while the request runs, other controls wait, the Gallery refreshes from the server afterwards", async () => {
    let finish!: () => void;
    let current = withGallery([], 7);
    server.handlers["/api/session"] = () => json(current);
    server.handlers["/api/portrait/generate"] = async () => {
      await new Promise<void>(resolve => { finish = resolve; });
      current = withGallery(gallery(), 8);
      return json({ ok: true, changed: true, message: "3 avatar options added.", ...current });
    };
    renderRoutes(routes, PATH);
    await screen.findByRole("heading", { level: 1, name: "Nicco" });
    await userEvent.selectOptions(screen.getByLabelText("Avatar pose"), "smile");
    await userEvent.click(screen.getByRole("button", { name: "Generate 3 avatars" }));
    expect(await screen.findByText("Generating 3 avatar images")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generating 3 avatars…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate 3 full-body images" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getAllByText(/Avatar \d of 3…/).length).toBe(3);
    expect(server.requests.find(r => r.url === "/api/portrait/generate")!.body).toEqual({ ref: "a1b2c3d4e5f6a1b2c3d4e5f6", expected_revision: 7, kind: "avatar", pose: "smile" });
    finish();
    await waitFor(() => expect(screen.queryByText("Generating 3 avatar images")).toBeNull());
    expect(screen.getAllByRole("button", { name: /^View portrait/ })).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Generate 3 avatars" })).toBeEnabled();
  });

  it("a failed generation shows a retryable error and leaves the Gallery as the server has it", async () => {
    server.handlers["/api/session"] = () => json(makeSession());
    server.handlers["/api/portrait/generate"] = () => json({ ok: false, error: { code: "portrait_generation_failed", message: "The image provider is unavailable. Try again." }, ...makeSession() }, 502);
    renderRoutes(routes, PATH);
    await userEvent.click(await screen.findByRole("button", { name: "Generate 3 avatars" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/image provider is unavailable/);
    expect(screen.getByRole("button", { name: "Generate 3 avatars" })).toBeEnabled();
  });

  it("states why generation is unavailable when the engine blocks it or the Gallery is full", async () => {
    const blocked = makeSession({ player_character: makePlayerCharacter({}, makePortrait({ can_generate_batch: false, generation_blocked: "Portraits need an established adult character." })) });
    await open(blocked);
    expect(screen.getByText("Portraits need an established adult character.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate 3 avatars" })).toBeDisabled();
  });

  it("UI2-12 shows nothing internal: no character id, prompt, file path or asset token appears as text or in non-image attributes", async () => {
    const dirty = withGallery();
    const visual = dirty.player_character!.visual!;
    // The payload may carry fields the client never declared; none of them may reach the screen.
    (visual as unknown as Record<string, unknown>).character_id = "nicco";
    (visual.editor as unknown as Record<string, unknown>).portrait_prompts = { avatar: { prompt: "SECRET-PROMPT-TEXT" } };
    (visual.editor.portrait.gallery[0] as unknown as Record<string, unknown>).asset_file = "portraits/campaign_x/nicco/v1.png";
    await open(dirty);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/SECRET-PROMPT|nicco\/v1|portraits\/campaign|asset_file|character_id|a1b2c3d4e5f6/);
    const attrs = [...document.body.querySelectorAll("*")].flatMap(el => [...el.attributes].filter(a => !["src", "href"].includes(a.name)).map(a => a.value)).join("\n");
    expect(attrs).not.toMatch(/SECRET-PROMPT|nicco\/v1|portraits\/campaign|a1b2c3d4e5f6|\bg[123]\b/);
  });

  it("UI2-15 image actions stay on the local API with scripted answers: no other host is ever contacted", async () => {
    portraitServer(withGallery());
    renderRoutes(routes, PATH);
    await userEvent.click(await screen.findByRole("button", { name: /^View portrait 2 of 3/ }));
    await userEvent.click(screen.getByRole("button", { name: "Set as Full Body" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Full Body ✓" })).toBeTruthy());
    expect(server.requests.length).toBeGreaterThan(1);
    expect(server.requests.every(r => r.url.startsWith("/api/"))).toBe(true);
  });

  it("is reachable from the play screen's player row, and moving there keeps the composer draft", async () => {
    server.handlers["/api/session"] = () => json(makeSession());
    const { router } = renderRoutes(routes, "/play/campaign_test");
    const input = await screen.findByLabelText("What Nicco says or does");
    await userEvent.type(input, "half a sentence");
    await userEvent.click(screen.getByRole("link", { name: "Nicco: open the character page" }));
    await screen.findByRole("heading", { level: 1, name: "Nicco" });
    expect(router.state.location.pathname).toBe(PATH);
    await userEvent.click(within(screen.getByRole("navigation", { name: "Campaign pages" })).getByRole("link", { name: "Play" }));
    expect(((await screen.findByLabelText("What Nicco says or does")) as HTMLTextAreaElement).value).toBe("half a sentence");
    // the session was read once: the query cache lives in the play route, not in the pages
    expect(server.requests.filter(r => r.url === "/api/session").length).toBe(1);
  });
});
