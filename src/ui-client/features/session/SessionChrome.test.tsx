import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import type { ActiveSessionPayload, SaveStateDto } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeSession } from "../../test/fixtures";
import { json, renderRoutes } from "../../test/render";

const server = useFakeServer();
const withSave = (save: SaveStateDto): ActiveSessionPayload => { const s = makeSession(); return { ...s, campaign: { ...s.campaign!, save } }; };

describe("session navigation", () => {
  it("links every page of the open campaign and marks the current one", async () => {
    server.handlers["/api/session"] = () => json(makeSession());
    renderRoutes(routes, "/play/campaign_test/household");
    await screen.findByRole("heading", { level: 1, name: "Household" });
    const nav = screen.getByRole("navigation", { name: "Campaign pages" });
    const hrefs = within(nav).getAllByRole("link").map(a => a.getAttribute("href"));
    expect(hrefs).toEqual(["/play/campaign_test", "/play/campaign_test/household", "/play/campaign_test/inventory", "/play/campaign_test/character/player", "/play/campaign_test/settings"]);
    expect(within(nav).getByRole("link", { name: "Household" }).getAttribute("aria-current")).toBe("page");
  });

  it("keeps the composer draft when moving to another page and back", async () => {
    server.handlers["/api/session"] = () => json(makeSession());
    renderRoutes(routes, "/play/campaign_test");
    const box = await screen.findByLabelText(/says or does$/);
    const user = userEvent.setup();
    await user.type(box, "half a thought");
    await user.click(within(screen.getByRole("navigation", { name: "Campaign pages" })).getByRole("link", { name: "Household" }));
    await screen.findByRole("heading", { level: 1, name: "Household" });
    await user.click(within(screen.getByRole("navigation", { name: "Campaign pages" })).getByRole("link", { name: "Play" }));
    expect((await screen.findByLabelText(/says or does$/) as HTMLTextAreaElement).value).toBe("half a thought");
  });
});

describe("save banner", () => {
  it("explains an oversized campaign without calling it damaged", async () => {
    server.handlers["/api/session"] = () => json(withSave({ state: "unsaved", error: "save_too_large" }));
    server.handlers["/api/save-status"] = () => json({ campaign: { id: "campaign_test", save: { state: "unsaved", error: "save_too_large" } } });
    renderRoutes(routes, "/play/campaign_test");
    expect((await screen.findAllByText("Save too large")).length).toBeGreaterThan(0);
    expect(screen.getByText(/last save is intact/)).toBeTruthy();
  });

  it("warns near the limit and when autosave is paused, and is silent when all is well", async () => {
    server.handlers["/api/session"] = () => json(withSave({ state: "saved", size_warning: true }));
    renderRoutes(routes, "/play/campaign_test");
    expect(await screen.findByText("Close to the save limit")).toBeTruthy();
  });

  it("shows no banner for a healthy save", async () => {
    server.handlers["/api/session"] = () => json(withSave({ state: "saved", autosave: "on" }));
    renderRoutes(routes, "/play/campaign_test");
    await screen.findByLabelText(/says or does$/);
    expect(screen.queryByText("Save too large")).toBeNull();
    expect(screen.queryByText("Autosave paused")).toBeNull();
    expect(screen.queryByText("Close to the save limit")).toBeNull();
  });
});

describe("narrator alternatives", () => {
  it("offers a comparison only when the server marks it available, and calls the provider only on the button", async () => {
    const session = makeSession({ alternate_models: [{ id: "m/alt", label: "Alt model" }], messages: [{ role: "narrator", text: "The market is loud.", seq: 0, comparison_id: "cmp1", comparison_available: true }] });
    server.handlers["/api/session"] = () => json(session);
    server.handlers["/api/alternative"] = () => json({ alternatives: [{ model: "m/alt", label: "Alt model", text: "A different telling." }] });
    renderRoutes(routes, "/play/campaign_test");
    const user = userEvent.setup();
    await user.click(await screen.findByText("Compare with another model"));
    expect(server.requests.some(r => r.url === "/api/alternative")).toBe(false);
    await user.selectOptions(screen.getByLabelText("Model for the comparison"), "m/alt");
    await user.click(screen.getByRole("button", { name: "Generate comparison" }));
    await screen.findByRole("button", { name: "Generate comparison" });
    expect(server.requests.filter(r => r.url === "/api/alternative")).toHaveLength(1);
    expect(server.requests.find(r => r.url === "/api/alternative")?.body).toEqual({ message_id: "cmp1", model: "m/alt" });
  });

  it("offers nothing for a message the server has not enabled", async () => {
    server.handlers["/api/session"] = () => json(makeSession({ alternate_models: [{ id: "m/alt", label: "Alt model" }] }));
    renderRoutes(routes, "/play/campaign_test");
    await screen.findByLabelText(/says or does$/);
    expect(screen.queryByText("Compare with another model")).toBeNull();
  });
});
