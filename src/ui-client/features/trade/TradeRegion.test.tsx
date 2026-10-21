import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TradeRegion } from "./TradeRegion";
import type { TradeViewDto } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeOffer, makeSession } from "../../test/fixtures";
import { json, renderWithProviders } from "../../test/render";

/** The Actual Offer region against a stubbed server: what Accept sends, what a refusal and a settlement leave on screen. */
const server = useFakeServer();
const view = (trade: Partial<TradeViewDto>): TradeViewDto => ({ offer: null, notice: null, receipt: null, ...trade });
const region = (trade: TradeViewDto, blockedReason: string | null = null) => renderWithProviders(<TradeRegion trade={trade} blockedReason={blockedReason} />, { session: makeSession({ trade }) });

describe("TradeRegion", () => {
  it("Accept posts ONLY the offer ref and the rendered revision, and the receipt replaces the card without a reload", async () => {
    const settled = makeSession({ revision: 8, trade: { offer: null, notice: null, receipt: { ref: "rc1", direction: "buy", kind: "goods", gold: 15, summary: "Bought Halberd for 15 gold" } } });
    server.handlers["/api/trade/accept"] = () => json({ ok: true, ...settled });
    region(view({ offer: makeOffer() }));
    await userEvent.click(screen.getByRole("button", { name: /Accept offer/ }));
    await waitFor(() => expect(server.requests.filter(r => r.url === "/api/trade/accept")).toHaveLength(1));
    const body = server.requests.find(r => r.url === "/api/trade/accept")!.body!;
    expect(body).toEqual({ ref: makeOffer().ref, expected_revision: 7 });
    expect(Object.keys(body).sort()).toEqual(["expected_revision", "ref"]);
  });

  it("a stale or refused acceptance shows its safe reason inline as an alert, leaves the card in place and lets the player try again", async () => {
    const standing = makeSession({ trade: { offer: makeOffer(), notice: null, receipt: null } });
    server.handlers["/api/trade/accept"] = () => json({ ok: false, error: { code: "validation", message: "Not enough gold. The offer stays open." }, ...standing }, 422);
    region(view({ offer: makeOffer() }));
    await userEvent.click(screen.getByRole("button", { name: /Accept offer/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Not enough gold. The offer stays open.");
    expect(screen.getByRole("region", { name: "Buy offer" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: /Accept offer/ })).toBeEnabled());
  });

  it("a withdrawn or superseded offer leaves no actionable card, only a short notice; with nothing to show the region renders nothing", () => {
    const { container, unmount } = region(view({ notice: { ref: "b".repeat(24), status: "withdrawn", text: "The offer was withdrawn." } }));
    expect(screen.queryByRole("button", { name: /Accept offer/ })).toBeNull();
    expect(screen.getByText("The offer was withdrawn.")).toBeTruthy();
    unmount();
    const empty = region(view({}));
    expect(empty.container.textContent).toBe("");
    expect(container).toBeTruthy();
  });

  it("an unaffordable BUY disables Accept and says so; a SELL does not", () => {
    region(view({ offer: makeOffer({ affordable: false, gold: 10 }) }));
    expect(screen.getByRole("button", { name: /Accept offer/ })).toBeDisabled();
    expect(screen.getByText("Not enough gold (you have 10).")).toBeTruthy();
  });

  it("settles with the last receipts shown above the standing offer", () => {
    region(view({ offer: makeOffer({ ref: "0ffe70000000000000000002" }), receipt: { ref: "rc9", direction: "buy", kind: "goods", gold: 15, summary: "Bought Halberd for 15 gold" } }));
    expect(screen.getByText(/Bought Halberd for 15 gold\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Accept offer/ })).toBeEnabled();
  });

  it("untrusted text in a card is inert: lines and labels are text, never markup", () => {
    region(view({ offer: makeOffer({ lines: ["<img src=x onerror=alert(1)>"], counterparty: "<script>alert(1)</script>", summary: "Buy <b>thing</b>" }) }));
    const card = screen.getByRole("region", { name: "Buy offer" });
    expect(card.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(card.textContent).toContain("<script>alert(1)</script>");
    expect(card.querySelector("img, script, b")).toBeNull();
  });
});
