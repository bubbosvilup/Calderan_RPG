import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { routes } from "./router";
import type { ActiveSessionPayload } from "../api/types";
import { useFakeServer } from "../test/fakeServer";
import { makeSession } from "../test/fixtures";
import { json, renderRoutes } from "../test/render";

const server = useFakeServer();
const playtest = (session: ActiveSessionPayload) => { const { campaign: _campaign, ...rest } = session; return rest as ActiveSessionPayload; };

describe("session routes", () => {
  it("the disposable playtest session has its pages under /play, linked inside /play", async () => {
    server.handlers["/api/session"] = () => json(playtest(makeSession()));
    renderRoutes(routes, "/play/inventory");
    await screen.findByRole("heading", { level: 1, name: "Inventory" });
    const nav = screen.getByRole("navigation", { name: "Campaign pages" });
    expect(within(nav).getByRole("link", { name: "Play" }).getAttribute("href")).toBe("/play");
    expect(within(nav).getByRole("link", { name: "Nicco" }).getAttribute("href")).toBe("/play/character/player");
  });

  it("a persistent campaign's pages live under /play/<campaign id>", async () => {
    server.handlers["/api/session"] = () => json(makeSession());
    renderRoutes(routes, "/play/campaign_test/character/player");
    await screen.findByRole("heading", { level: 1, name: "Nicco" });
    expect(screen.getByText("Test campaign")).toBeTruthy();
  });

  it("a page URL without a campaign id forwards to the open campaign's page, keeping the page", async () => {
    server.handlers["/api/session"] = () => json(makeSession());
    const { router } = renderRoutes(routes, "/play/inventory");
    await screen.findByRole("heading", { level: 1, name: "Inventory" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/campaign_test/inventory"));
  });

  it("a page URL naming a campaign that is not open offers to open it, never loads it implicitly", async () => {
    server.handlers["/api/session"] = () => json(makeSession());
    renderRoutes(routes, "/play/campaign_other/inventory");
    expect(await screen.findByRole("heading", { name: "This campaign is not open" })).toBeTruthy();
    expect(server.requests.some(r => r.url === "/api/campaigns/load")).toBe(false);
  });

  it("the playtest session forwards a campaign-qualified page URL to the same page under /play", async () => {
    server.handlers["/api/session"] = () => json(playtest(makeSession()));
    const { router } = renderRoutes(routes, "/play/campaign_test/inventory");
    await waitFor(() => expect(router.state.location.pathname).toBe("/play/inventory"));
  });
});
