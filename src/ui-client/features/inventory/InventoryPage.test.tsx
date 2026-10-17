import { describe, expect, it } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import { queryKeys } from "../../api/queryKeys";
import type { ActiveSessionPayload } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeInventory, makeItem, makeSession } from "../../test/fixtures";
import { json, renderRoutes } from "../../test/render";

const server = useFakeServer();
const open = async (session: ActiveSessionPayload, path = "/play/campaign_test/inventory") => {
  server.handlers["/api/session"] = () => json(session);
  const view = renderRoutes(routes, path);
  await screen.findByRole("heading", { level: 1, name: "Inventory" });
  return view;
};
const names = () => within(document.querySelector("ul[aria-describedby]") as HTMLElement).getAllByRole("button").map(b => b.querySelector("strong")?.textContent);

describe("Inventory page", () => {
  it("UI2-1 renders the authoritative items: name, how each is held, ownership, counts and gold", async () => {
    await open(makeSession());
    expect(names()).toEqual(["Iron dagger", "Traveller's cloak", "Sealed letter"]);
    expect(screen.getByText("3 items · 2 carried · 1 equipped")).toBeTruthy();
    expect(screen.getByTestId("inventory-gold").textContent).toBe("500");
    expect(screen.getByRole("button", { name: "Traveller's cloak, equipped" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Iron dagger, carried" })).toBeTruthy();
    // ownership is player-safe: it says the item is someone else's, never whose
    expect(screen.getByRole("button", { name: "Sealed letter, carried, belongs to someone else" })).toBeTruthy();
  });

  it("UI2-2 filters All / Carried / Equipped by the position the read model reports, with keyboard-operable pressed buttons", async () => {
    await open(makeSession());
    const group = screen.getByRole("group", { name: "Show items" });
    const all = within(group).getByRole("button", { name: "All" }), carried = within(group).getByRole("button", { name: "Carried" }), equipped = within(group).getByRole("button", { name: "Equipped" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    carried.focus();
    await userEvent.keyboard("{Enter}");
    expect(carried.getAttribute("aria-pressed")).toBe("true");
    expect(names()).toEqual(["Iron dagger", "Sealed letter"]);
    equipped.focus();
    await userEvent.keyboard(" ");
    expect(names()).toEqual(["Traveller's cloak"]);
    await userEvent.click(all);
    expect(names()).toHaveLength(3);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search items" }), "zzz");
    expect(screen.getByText("No items match this filter or search.")).toBeTruthy();
  });

  it("UI2-3 reconstructs no engine rule: position, ownership and state come from fields, never from category or name", async () => {
    // A "weapon" that the read model says is stored, an "armor" that is merely carried, and a kind this client has never heard of.
    const items = [
      makeItem({ id: "x1", name: "Mystery blade", category_label: "weapon", position: { kind: "stored" }, state_label: "Stored in the chest" }),
      makeItem({ id: "x2", name: "Plate cuirass", category_label: "armor", position: { kind: "carried" }, state_label: "Carried" }),
      makeItem({ id: "x3", name: "Odd thing", category_label: "miscellaneous", position: { kind: "somewhere_new" }, state_label: "Elsewhere" }),
    ];
    await open(makeSession({ inventory: makeInventory({ items, counts: { total: 3, carried: 1, equipped: 0 } }) }));
    expect(screen.getByRole("button", { name: "Mystery blade, stored" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Plate cuirass, carried" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Odd thing, unknown" })).toBeTruthy();
    // counts are the server's, not recounted from the list
    expect(screen.getByText("3 items · 1 carried · 0 equipped")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Equipped" }));
    expect(screen.getByText("No items match this filter or search.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await userEvent.click(screen.getByRole("button", { name: "Mystery blade, stored" }));
    expect(screen.getByRole("region", { name: "Item details" }).textContent).toMatch(/Stored in the chest/);
  });

  it("shows the selected item's detail and the read-only equipment slots from the read model", async () => {
    await open(makeSession());
    expect(screen.getByText("Select an item to see it here.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Traveller's cloak, equipped" }));
    const detail = screen.getByRole("region", { name: "Item details" });
    expect(within(detail).getByRole("heading", { name: "Traveller's cloak" })).toBeTruthy();
    expect(within(detail).getByText("Wool, patched at the hem.")).toBeTruthy();
    expect(within(detail).getByText("Equipped · chest · worn")).toBeTruthy();
    const equipment = screen.getByRole("region", { name: "Equipment" });
    expect(within(equipment).getByText("Head").parentElement?.textContent).toMatch(/Empty/);
    expect(within(equipment).getByText("Chest").parentElement?.textContent).toMatch(/Traveller's cloak/);
    expect(within(equipment).queryByRole("button", { name: /equip|unequip|drop|use/i })).toBeNull();
  });

  it("an empty inventory says so", async () => {
    await open(makeSession({ inventory: makeInventory({ items: [], counts: { total: 0, carried: 0, equipped: 0 } }) }));
    expect(screen.getByText(/Your inventory is empty/)).toBeTruthy();
  });

  it("an item with a long name stays inside its card and keeps its full name for assistive tech", async () => {
    const long = "A very long item name that keeps going and going well past what a narrow card can show on a single line";
    await open(makeSession({ inventory: makeInventory({ items: [makeItem({ name: long })], counts: { total: 1, carried: 1, equipped: 0 } }) }));
    expect(screen.getByRole("button", { name: `${long}, carried` }).getAttribute("title")).toBe(long);
  });

  it("refreshes the one session cache while an illustration is pending, and stops when it is ready", async () => {
    const pending = makeSession({ inventory: makeInventory({ items: [makeItem({ sprite_status: "pending" })], counts: { total: 1, carried: 1, equipped: 0 } }) });
    const { client } = await open(pending);
    let fetches = 0;
    server.handlers["/api/session"] = () => { fetches++; return json(makeSession()); };
    await waitFor(() => expect(fetches).toBeGreaterThan(0), { timeout: 10000 });
    await waitFor(() => expect(client.getQueryData<ActiveSessionPayload>(queryKeys.session)?.inventory.items.length).toBe(3));
    const before = fetches;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 2300)); });
    expect(fetches).toBe(before);
  }, 15000);

  it("links to Play and to the character page, and the campaign navigation marks the current page", async () => {
    await open(makeSession());
    const nav = screen.getByRole("navigation", { name: "Campaign pages" });
    expect(within(nav).getByRole("link", { name: "Inventory" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Play" }).getAttribute("href")).toBe("/play/campaign_test");
    expect(within(nav).getByRole("link", { name: "Nicco" }).getAttribute("href")).toBe("/play/campaign_test/character/player");
  });
});
