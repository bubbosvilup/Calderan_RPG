import { describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routes } from "../../app/router";
import type { ActiveSessionPayload } from "../../api/types";
import { useFakeServer } from "../../test/fakeServer";
import { makeSession } from "../../test/fixtures";
import { json, ndjson, renderRoutes } from "../../test/render";

/**
 * The turn pipeline as the page lives it (the replacement for the retired vanilla client's stream tests): one pending exchange built only
 * from the closed status vocabulary, committed state applied only from the final result, every kind of ending cleaned up, and the
 * administrative `/location` correction kept out of the story.
 */
const server = useFakeServer();
const playtest = (session: ActiveSessionPayload) => { const { campaign: _campaign, ...rest } = session; return rest as ActiveSessionPayload; };
const encoder = new TextEncoder();
const NDJSON = { "content-type": "application/x-ndjson; charset=utf-8" };

/** A turn response the test feeds line by line (or byte by byte) and closes itself. */
function openStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { controller = c; } });
  return {
    response: () => new Response(body, { status: 200, headers: NDJSON }),
    emit: (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")),
    emitSplit: (event: object) => { for (const byte of encoder.encode(JSON.stringify(event) + "\n")) controller.enqueue(new Uint8Array([byte])); },
    close: () => controller.close(),
  };
}
const composer = () => screen.findByLabelText("What Nicco says or does") as Promise<HTMLTextAreaElement>;
const status = () => within(screen.getByRole("form", { name: "Your action" })).getByRole("status");
const pendingBubble = () => document.querySelector<HTMLElement>("[aria-busy='true']");

describe("turn progress", () => {
  it("shows closed-vocabulary status words only: a hostile text field or unknown phase is never rendered, and progress never moves scene, gold or earlier messages", async () => {
    const initial = playtest(makeSession());
    const stream = openStream();
    server.handlers["/api/session"] = () => json(initial);
    server.handlers["/api/turn"] = () => stream.response();
    renderRoutes(routes, "/play");
    const input = await composer();
    await userEvent.type(input, "*looks around*{Enter}");
    // Before any progress the pending bubble shows the generic word, never draft prose.
    expect(await screen.findByText("Thinking…", { selector: "span" })).toBeTruthy();
    expect(status().textContent).toBe("Thinking…");
    expect(pendingBubble()).not.toBeNull();
    const earlier = screen.getAllByRole("article")[0]!;
    stream.emit({ type: "progress", phase: "narrating", text: "*Korvin leaves the ro", scene: { location: "Fake place" }, play: { gold: 999 } });
    expect(await screen.findByText("Narrating…", { selector: "span" })).toBeTruthy();
    stream.emit({ type: "progress", phase: "resolving" });
    expect(await screen.findByText("Resolving…", { selector: "span" })).toBeTruthy();
    expect(status().textContent).toBe("Resolving…");
    stream.emit({ type: "progress", phase: "not-a-phase", text: "Injected label" });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.getByText("Resolving…", { selector: "span" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Korvin leaves|Injected label|Fake place/);
    expect(screen.getByTestId("player-gold").textContent).toBe("500");
    expect(screen.getByText("Slave market")).toBeTruthy();
    expect(screen.getAllByRole("article")[0]).toBe(earlier);
    // A second submission while the turn runs is not sent.
    await userEvent.type(input, "again{Enter}");
    expect(server.requests.filter(r => r.url === "/api/turn")).toHaveLength(1);

    // The final result (delivered a byte at a time, splitting JSON strings and characters) is the only thing that changes the page.
    const done = { ...initial, revision: 8, scene: { location: "Heartstone LR", time_of_day: "Early Afternoon", date_text: "Year 1191, Vesp Alpha 2, Stonewake" }, play: { ...initial.play, gold: 485 },
      messages: [...initial.messages, { role: "player" as const, text: "*looks around*", seq: 1 }, { role: "narrator" as const, text: '*Korvin remains beside Nicco.*\n\n"All is well — truly."', seq: 2 }] };
    stream.emitSplit({ type: "result", ok: true, ...done });
    stream.close();
    expect(await screen.findByText(/All is well — truly\./)).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId("player-gold").textContent).toBe("485"));
    expect(screen.getByText("Heartstone LR")).toBeTruthy();
    expect(screen.getByText("Early Afternoon")).toBeTruthy();
    await waitFor(() => expect(pendingBubble()).toBeNull());
    expect(status().textContent).toBe("Your turn.");
    expect(input.value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it("a refused turn (provider failure) removes the pending exchange, shows no draft prose, keeps the typed text and says the message was not applied", async () => {
    const initial = playtest(makeSession());
    server.handlers["/api/session"] = () => json(initial);
    server.handlers["/api/turn"] = () => ndjson([
      { type: "progress", phase: "narrating" },
      { type: "result", ok: false, error: { code: "provider_failed", message: "Provider unavailable.", turn_state_changed: false }, ...initial },
    ]);
    renderRoutes(routes, "/play");
    const input = await composer();
    await userEvent.type(input, "*looks around*{Enter}");
    const alert = await screen.findByText(/Turn failed\. Your message was not applied\./);
    expect(alert.textContent).toMatch(/Provider unavailable\./);
    await waitFor(() => expect(pendingBubble()).toBeNull());
    expect(screen.getAllByRole("article")).toHaveLength(initial.messages.length);
    expect(input.value).toBe("*looks around*");
    expect(input.readOnly).toBe(false);
    expect(status().textContent).toBe("Your turn.");
  });

  it("a cancelled turn (the server's own refusal) behaves like any other refusal: nothing committed, text kept", async () => {
    const initial = playtest(makeSession());
    server.handlers["/api/session"] = () => json(initial);
    server.handlers["/api/turn"] = () => ndjson([{ type: "result", ok: false, error: { message: "Cancelled.", turn_state_changed: false }, ...initial }]);
    renderRoutes(routes, "/play");
    const input = await composer();
    await userEvent.type(input, "Wait.{Enter}");
    expect(await screen.findByText(/Turn failed\. Your message was not applied\. Cancelled\./)).toBeTruthy();
    expect(input.value).toBe("Wait.");
    expect(pendingBubble()).toBeNull();
  });

  it("an interrupted stream (no final line) is retried with the same turn key, then reports the interruption, keeps the text and refreshes the story", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const initial = playtest(makeSession());
      server.handlers["/api/session"] = () => json(initial);
      server.handlers["/api/turn"] = () => ndjson([{ type: "progress", phase: "narrating", text: "*Korvin leaves the room.*" }]);
      renderRoutes(routes, "/play");
      const input = await composer();
      await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(input, "Hello{Enter}");
      await vi.advanceTimersByTimeAsync(4000);
      expect(await screen.findByText(/Connection interrupted\./)).toBeTruthy();
      const turns = server.requests.filter(r => r.url === "/api/turn");
      expect(turns.length).toBeGreaterThan(1);
      expect(new Set(turns.map(r => r.body?.turn_key)).size).toBe(1);
      expect(document.body.textContent).not.toMatch(/Korvin leaves/);
      expect(input.value).toBe("Hello");
      expect(pendingBubble()).toBeNull();
    } finally { vi.useRealTimers(); }
  }, 20000);
});

describe("/location correction", () => {
  const withLocation = (session: ActiveSessionPayload, location: string, revision: number): ActiveSessionPayload => ({ ...session, revision, scene: { ...session.scene, location } });

  it("is an administrative request, not a turn: it posts the target and the rendered revision, adds nothing to the story, and the new location comes from the returned state", async () => {
    const initial = playtest(makeSession());
    server.handlers["/api/session"] = () => json(initial);
    server.handlers["/api/location"] = () => json({ ok: true, confirmation: "Manual location correction. Time unchanged.", ...withLocation(initial, "Heartstone LR", 8) });
    renderRoutes(routes, "/play");
    const input = await composer();
    const articles = screen.getAllByRole("article").length;
    await userEvent.type(input, "/location heartstone_lr{Enter}");
    expect(await screen.findByText("Manual location correction. Time unchanged.")).toBeTruthy();
    expect(server.requests.find(r => r.url === "/api/location")?.body).toEqual({ target: "heartstone_lr", expected_revision: 7 });
    expect(server.requests.some(r => r.url === "/api/turn")).toBe(false);
    expect(screen.getByText("Heartstone LR")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(articles);
    expect(pendingBubble()).toBeNull();
    expect(input.value).toBe("");
  });

  it("a refused correction shows the server's sentence and its candidates, leaves the location alone and keeps the text", async () => {
    const initial = playtest(makeSession());
    server.handlers["/api/session"] = () => json(initial);
    server.handlers["/api/location"] = () => json({ ok: false, error: { code: "validation", message: "Unknown canonical location." }, candidates: ["heartstone_lr", "heartstone_kitchen"], ...initial }, 422);
    renderRoutes(routes, "/play");
    const input = await composer();
    await userEvent.type(input, "/location nowhere{Enter}");
    const alert = await screen.findByText(/Unknown canonical location\./);
    expect(alert.textContent).toMatch(/Candidates: heartstone_lr, heartstone_kitchen\./);
    expect(screen.getByText("Slave market")).toBeTruthy();
    expect(input.value).toBe("/location nowhere");
  });
});
