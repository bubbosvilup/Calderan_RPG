import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import type { ActiveSessionPayload } from "../../api/types";
import { makeOffer, makeSession } from "../../test/fixtures";
import { json, ndjson, renderRoutes } from "../../test/render";

/**
 * The play screen against a stubbed server: the stubs answer like the play server does (every response carries the fresh state), so these
 * tests check the client's handling of the contract, not game rules.
 */
type Handler = (url: string, body: Record<string, unknown> | undefined) => Response | Promise<Response>;
let handlers: Record<string, Handler>;
const requests: { url: string; body: Record<string, unknown> | undefined }[] = [];

beforeEach(() => {
  window.innerWidth = 1440;
  requests.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
    requests.push({ url, body });
    const handler = handlers[url];
    if (!handler) return json({ error: "Not found." }, 404);
    return handler(url, body);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const playtest = (session: ActiveSessionPayload) => { const { campaign: _campaign, ...rest } = session; return rest as ActiveSessionPayload; };

describe("PlayScreen", () => {
  it("renders the session and plays a turn: pending state, committed response, gold, focus back in the composer", async () => {
    let session = playtest(makeSession());
    let finish!: () => void;
    handlers = {
      "/api/session": () => json(session),
      "/api/turn": async (_url, body) => {
        await new Promise<void>(resolve => { finish = resolve; });
        session = { ...session, revision: 8, messages: [...session.messages, { role: "player", text: String(body?.text), seq: 1 }, { role: "narrator", text: "Korvin nods.", seq: 2 }], play: { ...session.play, gold: 485 } };
        return ndjson([{ type: "progress", phase: "narrating" }, { type: "result", ok: true, ...session }]);
      },
    };
    renderRoutes(routes, "/play");
    const input = await screen.findByLabelText("What Nicco says or does");
    expect(screen.getByTestId("player-gold").textContent).toBe("500");
    expect(screen.getByText("Slave market")).toBeTruthy();
    await userEvent.type(input, "Hello Korvin{Enter}");
    expect(await screen.findByText("Thinking…", { selector: "span" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    expect(requests.filter(r => r.url === "/api/turn")).toHaveLength(1);
    const turn = requests.find(r => r.url === "/api/turn")!.body!;
    expect(Object.keys(turn).sort()).toEqual(["expected_revision", "text", "turn_key"]);
    expect(turn.expected_revision).toBe(7);
    finish();
    expect(await screen.findByText("Korvin nods.")).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("player-gold").textContent).toBe("485"));
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("recovers from a stale revision: applies the fresh state, explains, and keeps the draft for a resend", async () => {
    const fresh = playtest(makeSession({ revision: 9, messages: [{ role: "narrator", text: "Something changed meanwhile.", seq: 0 }] }));
    handlers = {
      "/api/session": () => json(playtest(makeSession())),
      "/api/turn": () => ndjson([{ type: "result", ok: false, error: { code: "stale_turn", message: "The campaign changed while the turn was running. The turn was discarded." }, ...fresh }]),
    };
    renderRoutes(routes, "/play");
    const input = await screen.findByLabelText("What Nicco says or does");
    await userEvent.type(input, "Deal.{Enter}");
    expect(await screen.findByText(/The story changed since you last looked/)).toBeTruthy();
    expect(screen.getByText("Something changed meanwhile.")).toBeTruthy();
    expect((input as HTMLTextAreaElement).value).toBe("Deal.");
  });

  it("accepts an Actual Offer with only the ref and the rendered revision, then shows the receipt and the new gold", async () => {
    let session = playtest(makeSession({ trade: { offer: makeOffer(), notice: null, receipt: null } }));
    handlers = {
      "/api/session": () => json(session),
      "/api/trade/accept": () => {
        session = { ...session, revision: 8, trade: { offer: null, notice: null, receipt: { ref: "rc1", direction: "buy", kind: "goods", gold: 15, summary: "Bought Halberd for 15 gold" } }, play: { ...session.play, gold: 485 } };
        return json({ ok: true, ...session });
      },
    };
    renderRoutes(routes, "/play");
    await userEvent.click(await screen.findByRole("button", { name: "Accept offer: Buy Halberd for 15 gold" }));
    expect(await screen.findByText(/Bought Halberd for 15 gold\./)).toBeTruthy();
    expect(screen.getByTestId("player-gold").textContent).toBe("485");
    expect(requests.find(r => r.url === "/api/trade/accept")!.body).toEqual({ ref: makeOffer().ref, expected_revision: 7 });
    expect(screen.queryByRole("region", { name: "Buy offer" })).toBeNull();
  });

  it("disables state actions while the server reports a running turn, and says why", async () => {
    handlers = { "/api/session": () => json(playtest(makeSession({ status: "running_turn", trade: { offer: makeOffer(), notice: null, receipt: null } }))) };
    renderRoutes(routes, "/play");
    const accept = await screen.findByRole("button", { name: /Accept offer/ });
    expect(accept).toBeDisabled();
    expect(within(screen.getByRole("region", { name: "Buy offer" })).getByText("Available when the narrator finishes.")).toBeTruthy();
  });

  it("shows a connection failure on first load with a retry, without technical detail", async () => {
    handlers = { "/api/session": () => { throw new TypeError("ECONNREFUSED"); } };
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("ECONNREFUSED"); }));
    renderRoutes(routes, "/play");
    const alert = await screen.findByRole("alert", {}, { timeout: 15000 });
    expect(alert.textContent).toMatch(/did not answer/);
    expect(alert.textContent).not.toMatch(/ECONNREFUSED/);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  }, 20000);

  it("in persistent mode, a URL naming another campaign offers to open it instead of loading implicitly", async () => {
    handlers = { "/api/session": () => json(makeSession()), "/api/save-status": () => json({ campaign: null }) };
    renderRoutes(routes, "/play/campaign_other");
    expect(await screen.findByRole("heading", { name: "This campaign is not open" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open this campaign" })).toBeTruthy();
    expect(requests.some(r => r.url === "/api/campaigns/load")).toBe(false);
  });
});
