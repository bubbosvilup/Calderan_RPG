import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import type { CampaignListDto } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { json, renderRoutes } from "../../test/render";

const server = useFakeServer();
const noCampaign = { campaign: null, messages: [], status: "idle", configured: true };
const entry = (id: string, name: string, extra: Partial<CampaignListDto["campaigns"][number]> = {}) => ({ campaign_id: id, display_name: name, status: "valid", previous_valid: false, backups: [], locked: false, ...extra });
const list = (campaigns: CampaignListDto["campaigns"]): CampaignListDto => ({ campaigns, scenarios: [], active_campaign_id: null });

describe("Campaigns page", () => {
  it("deleting asks for confirmation naming the campaign; cancel sends nothing", async () => {
    server.handlers["/api/session"] = () => json(noCampaign);
    server.handlers["/api/campaigns"] = () => json(list([entry("campaign_a", "Alpha")]));
    renderRoutes(routes, "/");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete campaign Alpha" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this campaign?" });
    expect(within(dialog).getByText(/“Alpha”/)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(server.requests.some(r => r.url === "/api/campaigns/delete")).toBe(false);
  });

  it("confirming deletes through the server and refreshes the list", async () => {
    let campaigns = [entry("campaign_a", "Alpha"), entry("campaign_b", "Beta")];
    server.handlers["/api/session"] = () => json(noCampaign);
    server.handlers["/api/campaigns"] = () => json(list(campaigns));
    server.handlers["/api/campaigns/delete"] = (_u, body) => { campaigns = campaigns.filter(c => c.campaign_id !== body?.campaign_id); return json(noCampaign); };
    renderRoutes(routes, "/");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete campaign Alpha" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete permanently" }));
    await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(server.requests.find(r => r.url === "/api/campaigns/delete")?.body).toEqual({ campaign_id: "campaign_a" });
  });

  it("a refused delete shows the server's reason and the campaign stays", async () => {
    server.handlers["/api/session"] = () => json(noCampaign);
    server.handlers["/api/campaigns"] = () => json(list([entry("campaign_a", "Alpha")]));
    server.handlers["/api/campaigns/delete"] = () => json({ error: { code: "campaign_locked", message: "That campaign is open in another window." } }, 409);
    renderRoutes(routes, "/");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Delete campaign Alpha" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete permanently" }));
    expect(await screen.findByText(/open in another window/)).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  it("a locked campaign can neither be loaded nor deleted", async () => {
    server.handlers["/api/session"] = () => json(noCampaign);
    server.handlers["/api/campaigns"] = () => json(list([entry("campaign_a", "Alpha", { locked: true })]));
    renderRoutes(routes, "/");
    expect((await screen.findByRole("button", { name: "Load Alpha" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Delete campaign Alpha" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
