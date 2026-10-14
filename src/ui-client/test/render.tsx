import type { ReactElement, ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { AppProviders } from "../app/providers";
import { queryKeys } from "../api/queryKeys";
import type { SessionPayload } from "../api/types";

export const testClient = (session?: SessionPayload) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  if (session) client.setQueryData(queryKeys.session, session);
  return client;
};

/** Renders a component with the app providers (a test QueryClient, optionally pre-seeded with a session payload); `rerender` keeps them. */
export function renderWithProviders(ui: ReactElement, options: { readonly session?: SessionPayload; readonly client?: QueryClient } = {}) {
  const client = options.client ?? testClient(options.session);
  return { client, ...render(ui, { wrapper: ({ children }: { readonly children: ReactNode }) => <MemoryRouter><AppProviders client={client}>{children}</AppProviders></MemoryRouter> }) };
}

/** Renders routes in a memory router at `path`, with the app providers. */
export function renderRoutes(routes: RouteObject[], path: string, options: { readonly session?: SessionPayload; readonly client?: QueryClient } = {}) {
  const client = options.client ?? testClient(options.session);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { client, router, ...render(<AppProviders client={client}><RouterProvider router={router} /></AppProviders>) };
}

/** A fetch Response with a JSON body. */
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
/** A streamed turn response: progress lines then one final result line. */
export const ndjson = (events: readonly unknown[]) => new Response(events.map(e => JSON.stringify(e)).join("\n") + "\n", { status: 200, headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
