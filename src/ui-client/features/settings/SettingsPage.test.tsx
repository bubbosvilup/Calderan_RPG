import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import type { OptionalServicesDto } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeSession } from "../../test/fixtures";
import { json, renderRoutes } from "../../test/render";

const server = useFakeServer();
const PATH = "/play/campaign_test/settings";
const services: OptionalServicesDto = { services: [
  { service: "reflection", enabled: true, running: 1, last_error: { at: "2026-10-14T10:00:00.000Z", code: "provider_timeout" } },
  { service: "portrait_generation", enabled: false, running: 0 },
] };

describe("Settings page", () => {
  it("reports only what the server returns for the optional services, with no claim about their effect on the story", async () => {
    server.handlers["/api/session"] = () => json(makeSession());
    server.handlers["/api/optional-services"] = () => json(services);
    renderRoutes(routes, PATH);
    const list = await screen.findByRole("list");
    const reflection = within(list).getByText("Reflection").closest("li")!;
    expect(within(reflection).getByText("On")).toBeTruthy();
    expect(within(reflection).getByText("1 running")).toBeTruthy();
    expect(within(reflection).getByText(/provider timeout/)).toBeTruthy();
    expect(within(list).getByText("Portrait generation").closest("li")!.textContent).toContain("Off");
    expect(server.requests.filter(r => r.method === "POST")).toEqual([]);
  });

  it("explains an unavailable service report with a retry, not an empty page", async () => {
    server.handlers["/api/session"] = () => json(makeSession());
    renderRoutes(routes, PATH);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("closes the campaign on request and returns to the campaign list", async () => {
    server.handlers["/api/session"] = () => json(makeSession());
    server.handlers["/api/optional-services"] = () => json(services);
    server.handlers["/api/campaigns/close"] = () => json({ ok: true, campaign: null, messages: [], status: "idle", configured: true });
    server.handlers["/api/campaigns"] = () => json({ campaigns: [], scenarios: [], active_campaign_id: null });
    const { router } = renderRoutes(routes, PATH);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Close campaign" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(server.requests.some(r => r.url === "/api/campaigns/close" && r.method === "POST")).toBe(true);
  });
});
