import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, requestJson, requestNdjson, toApiError } from "./client";
import { submitTurn } from "./session";
import { json, ndjson } from "../test/render";

afterEach(() => vi.unstubAllGlobals());

describe("toApiError", () => {
  const appError = (code: string, message = "Server says so.") => ({ ok: false, error: { code, message, retryable: false, turn_state_changed: false } });
  it.each([
    [409, "stale_turn", "stale"],
    [409, "turn_in_progress", "busy"],
    [422, "invalid_input", "validation"],
    [422, "narrator_failed", "unavailable"],
    [500, "io_error", "save"],
    [409, "save_in_progress", "save"],
    [500, "internal_error", "unknown"],
  ] as const)("HTTP %s %s -> %s", (status, code, kind) => {
    const error = toApiError(status, appError(code));
    expect(error.kind).toBe(kind);
    expect(error.code).toBe(code);
    expect(error.message).toBe("Server says so.");
  });
  it("classifies by status when no AppError code is present and keeps the adapter's short message", () => {
    expect(toApiError(400, { error: "Enter 1–4000 characters." })).toMatchObject({ kind: "validation", message: "Enter 1–4000 characters." });
    expect(toApiError(403, { error: "Local access only." }).kind).toBe("forbidden");
    expect(toApiError(404, { error: "Not found." }).kind).toBe("not_found");
    expect(toApiError(503, null).kind).toBe("unavailable");
    expect(toApiError(500, null).kind).toBe("unknown");
  });
  it("never surfaces a non-string error payload; it falls back to fixed copy", () => {
    const error = toApiError(500, { error: { stack: "Error: boom\n    at x.js:1" } });
    expect(error.message).not.toMatch(/boom|at x\.js/);
    expect(error.message.length).toBeGreaterThan(10);
  });
});

describe("requestJson", () => {
  it("sends same-origin JSON with the exact content type the server accepts", async () => {
    const fetch = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await requestJson("/trade/accept", { method: "POST", body: { ref: "r", expected_revision: 3 } });
    expect(fetch).toHaveBeenCalledWith("/api/trade/accept", expect.objectContaining({ method: "POST", credentials: "same-origin", body: JSON.stringify({ ref: "r", expected_revision: 3 }), headers: expect.objectContaining({ "Content-Type": "application/json" }) }));
  });
  it("maps a dropped connection to a network error with our own copy (no exception text)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch: ECONNREFUSED 127.0.0.1"); }));
    const error = await requestJson<never>("/session").catch((e: unknown) => e as ApiError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.kind).toBe("network");
    expect(error.message).not.toMatch(/ECONNREFUSED|Failed to fetch/);
  });
  it("keeps the fresh state a refusal carries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: false, error: { code: "stale_turn", message: "Stale." }, messages: [], revision: 9 }, 409)));
    const error = await requestJson<never>("/trade/accept", { method: "POST", body: {} }).catch((e: unknown) => e as ApiError);
    expect(error.kind).toBe("stale");
    expect(error.body).toMatchObject({ revision: 9 });
  });
});

describe("requestNdjson / submitTurn", () => {
  it("delivers progress phases and returns the final result", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjson([{ type: "progress", phase: "thinking" }, { type: "progress", phase: "narrating" }, { type: "result", ok: true, messages: [], revision: 2, play: {}, scene: {} }])));
    const phases: string[] = [];
    const result = await submitTurn({ text: "Hello", expectedRevision: 1 }, { onPhase: phase => phases.push(phase) });
    expect(phases).toEqual(["thinking", "narrating"]);
    expect(result.state).toMatchObject({ revision: 2 });
  });
  it("throws a streamed refusal as an ApiError by its code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjson([{ type: "result", ok: false, error: { code: "stale_turn", message: "Stale." }, messages: [], revision: 3, play: {}, scene: {} }])));
    await expect(requestNdjson("/turn", { body: {} })).rejects.toMatchObject({ kind: "stale" });
  });
  it("treats a stream without its final line as a dropped connection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjson([{ type: "progress", phase: "thinking" }])));
    await expect(requestNdjson("/turn", { body: {} })).rejects.toMatchObject({ kind: "network" });
  });
  it("retries a dropped turn with the SAME turn key (the server answers a replay, never a second run)", async () => {
    vi.useFakeTimers();
    try {
      const bodies: string[] = [];
      let calls = 0;
      vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(String(init.body));
        if (++calls === 1) throw new TypeError("network down");
        return ndjson([{ type: "result", ok: true, replayed: true, messages: [], revision: 2, play: {}, scene: {} }]);
      }));
      const turn = submitTurn({ text: "Hello", expectedRevision: 1 });
      await vi.advanceTimersByTimeAsync(1000);
      const result = await turn;
      expect(result.replayed).toBe(true);
      expect(bodies).toHaveLength(2);
      expect(JSON.parse(bodies[0]!).turn_key).toBe(JSON.parse(bodies[1]!).turn_key);
    } finally { vi.useRealTimers(); }
  });
});
