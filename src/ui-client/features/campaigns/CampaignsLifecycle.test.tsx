import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import type { CampaignListDto, SaveStateDto } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeSession } from "../../test/fixtures";
import { json, renderRoutes } from "../../test/render";

/** Save/Load v1 in the React UI: the start screen, create and load requests, the load report, and the Save control's states. */
const server = useFakeServer();
const noCampaign = { campaign: null, messages: [], status: "idle", configured: true };
const list: CampaignListDto = { campaigns: [
  { campaign_id: "campaign_a", display_name: "First run", status: "valid", saved_at: "2026-10-08T10:00:00.000Z", location_name: "Market", world_minute: 1500, household_members: 1, previous_valid: true, backups: ["r00000012-20261008T100000000Z.json"], locked: false },
  { campaign_id: "campaign_b", display_name: "Broken run", status: "invalid_json", previous_valid: true, backups: ["r00000004-20261007T100000000Z.json"], locked: false },
], scenarios: [{ id: "caldrevan.slave_market.v1", label: "Arrival at the Calderan slave market", description: "Nicco arrives." }], active_campaign_id: null };
const sessionOf = (id: string, name: string, save: SaveStateDto) => { const s = makeSession({ messages: [{ role: "narrator", text: `*Opening of ${name}.*`, seq: 0 }] }); return { ...s, campaign: { id, display_name: name, save } }; };

describe("start screen", () => {
  it("lists the saved campaigns with their summary; recovery buttons exist only for a save that cannot be read; the scenario is described", async () => {
    server.handlers["/api/session"] = () => json(noCampaign);
    server.handlers["/api/campaigns"] = () => json(list);
    renderRoutes(routes, "/");
    const first = (await screen.findByText("First run")).closest("li")!, broken = screen.getByText("Broken run").closest("li")!;
    expect(first.textContent).toMatch(/Market · 1 in household · saved /);
    expect(within(first).getAllByRole("button").map(b => b.textContent)).toEqual(["Load", "Delete"]);
    expect(within(broken).getAllByRole("button").map(b => b.textContent)).toEqual(["Load previous save", "Load latest backup", "Delete"]);
    expect(broken.textContent).toMatch(/cannot be read/);
    expect(screen.getByText("Nicco arrives.")).toBeTruthy();
    expect(screen.queryByLabelText("What Nicco says or does")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("create sends only the trimmed name and the scenario id, then opens the new campaign's story; an empty name sends nothing", async () => {
    server.handlers["/api/session"] = () => json(noCampaign);
    server.handlers["/api/campaigns"] = () => json(list);
    server.handlers["/api/campaigns/create"] = (_u, body) => json({ ok: true, ...sessionOf("campaign_new", String(body?.display_name), { state: "saved", autosave: "on" }) });
    renderRoutes(routes, "/");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create campaign" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter a campaign name.");
    expect(server.requests.some(r => r.url === "/api/campaigns/create")).toBe(false);
    server.handlers["/api/session"] = () => json(sessionOf("campaign_new", "My run", { state: "saved", autosave: "on" }));
    await user.type(screen.getByLabelText("Campaign name"), "  My run ");
    await user.click(screen.getByRole("button", { name: "Create campaign" }));
    expect(await screen.findByText(/Opening of My run/)).toBeTruthy();
    expect(server.requests.find(r => r.url === "/api/campaigns/create")?.body).toEqual({ display_name: "My run", scenario_id: "caldrevan.slave_market.v1" });
    expect(screen.queryByText("Loaded with notes")).toBeNull();
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("explicit recovery loads the chosen slot, shows the load report once and opens that campaign's story, not the previous one", async () => {
    server.handlers["/api/session"] = () => json(noCampaign);
    server.handlers["/api/campaigns"] = () => json(list);
    server.handlers["/api/campaigns/load"] = (_u, body) => json({ ok: true, load_report: { warnings: ["Loaded from the previous save, not the latest save."] }, ...sessionOf(String(body?.campaign_id), "Loaded", { state: "saved", autosave: "on" }) });
    renderRoutes(routes, "/");
    const user = userEvent.setup();
    const broken = (await screen.findByText("Broken run")).closest("li")!;
    server.handlers["/api/session"] = () => json(sessionOf("campaign_b", "Loaded", { state: "saved", autosave: "on" }));
    await user.click(within(broken).getByRole("button", { name: "Load previous save" }));
    expect(await screen.findByText(/Opening of Loaded/)).toBeTruthy();
    expect(server.requests.find(r => r.url === "/api/campaigns/load")?.body).toEqual({ campaign_id: "campaign_b", slot: "previous" });
    const note = screen.getByText(/previous save/).closest("[role]")!;
    expect(note.textContent).toMatch(/Loaded with notes/);
    await user.click(within(note as HTMLElement).getByRole("button"));
    expect(screen.queryByText(/Loaded from the previous save/)).toBeNull();
  });
});

describe("Save control", () => {
  /** The status poll answers with the server's current save state, like the real route. */
  const serverSave = (save: SaveStateDto) => { server.handlers["/api/session"] = () => json(sessionOf("campaign_a", "First run", save)); server.handlers["/api/save-status"] = () => json({ campaign: { id: "campaign_a", save } }); };
  const mount = (save: SaveStateDto) => { serverSave(save); return renderRoutes(routes, "/play/campaign_a"); };
  it("shows the server's state (Unsaved changes), then Saving… and Saved, and posts an empty body", async () => {
    mount({ state: "unsaved", autosave: "on" });
    expect(await screen.findByText("Unsaved changes")).toBeTruthy();
    let finish!: () => void;
    server.handlers["/api/save"] = async () => { await new Promise<void>(resolve => { finish = resolve; }); serverSave({ state: "saved", autosave: "on" }); return json({ ok: true, ...sessionOf("campaign_a", "First run", { state: "saved", autosave: "on" }) }); };
    const save = screen.getByRole("button", { name: "Save" });
    await userEvent.click(save);
    expect(await screen.findByText("Saving…")).toBeTruthy();
    expect(save).toBeDisabled();
    finish();
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(server.requests.find(r => r.url === "/api/save")?.body).toEqual({});
  });
  it("a failed save says Save failed, explains that the session is intact, and the Save button stays available for a retry", async () => {
    mount({ state: "unsaved", autosave: "on" });
    server.handlers["/api/save"] = () => { serverSave({ state: "unsaved", error: "io_error", autosave: "on" }); return json({ ok: false, error: { code: "io_error", message: "The save could not be read or written." }, ...sessionOf("campaign_a", "First run", { state: "unsaved", error: "io_error", autosave: "on" }) }, 500); };
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("Save failed")).toBeTruthy();
    expect(screen.getByText("Save failed").getAttribute("title")).toMatch(/still in this session/);
    expect(screen.getByText(/could not be read or written/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
  it("an oversized save says Save too large with the banner that the last save is intact (never 'damaged' or 'retry'); a normal save later clears it", async () => {
    mount({ state: "unsaved", autosave: "on" });
    expect(screen.queryByText(/last save is intact/)).toBeNull();
    server.handlers["/api/save"] = () => json({ ok: false, error: { code: "save_too_large", message: "The campaign is too large to save." }, ...sessionOf("campaign_a", "First run", { state: "unsaved", error: "save_too_large", autosave: "on" }) }, 422);
    server.handlers["/api/save-status"] = () => json({ campaign: { id: "campaign_a", save: { state: "unsaved", error: "save_too_large", autosave: "on" } } });
    await userEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect((await screen.findAllByText("Save too large")).length).toBeGreaterThan(0);
    const banner = (await screen.findByText(/last save is intact/)).textContent!;
    expect(banner).toMatch(/too large to save/);
    expect(banner).not.toMatch(/retry|damaged|corrupt/i);
    server.handlers["/api/save"] = () => json({ ok: true, ...sessionOf("campaign_a", "First run", { state: "saved", autosave: "on", size_warning: true }) });
    server.handlers["/api/save-status"] = () => json({ campaign: { id: "campaign_a", save: { state: "saved", autosave: "on", size_warning: true } } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/close to the 16 MB save limit/)).toBeTruthy();
    expect(screen.queryByText(/last save is intact/)).toBeNull();
    server.handlers["/api/save"] = () => json({ ok: true, ...sessionOf("campaign_a", "First run", { state: "saved", autosave: "on" }) });
    server.handlers["/api/save-status"] = () => json({ campaign: { id: "campaign_a", save: { state: "saved", autosave: "on" } } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(screen.queryByText(/16 MB/)).toBeNull();
  });
  it("a disposable playtest session (no campaign) has no start screen and no Save control", async () => {
    const { campaign: _campaign, ...playtest } = makeSession();
    server.handlers["/api/session"] = () => json(playtest);
    renderRoutes(routes, "/play");
    await screen.findByLabelText("What Nicco says or does");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByText("Saved")).toBeNull();
  });
});
