import { afterEach, beforeEach, vi } from "vitest";
import { json } from "./render";

export type Handler = (url: string, body: Record<string, unknown> | undefined) => Response | Promise<Response>;
export interface RecordedRequest { readonly url: string; readonly method: string; readonly body: Record<string, unknown> | undefined }

/**
 * A stand-in for the play server: `fetch` is replaced for the duration of each test and answers from `handlers` (an unknown route is a 404).
 * Every request is recorded, so a test can prove what the page sent and that nothing left the local `/api` namespace.
 */
export function useFakeServer(width = 1440) {
  const server = { handlers: {} as Record<string, Handler>, requests: [] as RecordedRequest[] };
  beforeEach(() => {
    window.innerWidth = width;
    server.requests.length = 0;
    server.handlers = {};
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined;
      server.requests.push({ url, method: init?.method ?? "GET", body });
      const handler = server.handlers[url];
      return handler ? handler(url, body) : json({ error: "Not found." }, 404);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());
  return server;
}
