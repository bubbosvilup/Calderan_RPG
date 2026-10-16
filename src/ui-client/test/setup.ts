import { afterEach, expect } from "vitest";
import { cleanup, configure } from "@testing-library/react";

// The first render of a file is cold (module graph, jsdom, router); on a loaded Windows runner it can exceed the 1s default of findBy*/waitFor.
// This is a time budget for async queries only; every assertion is unchanged.
configure({ asyncUtilTimeout: 5000 });

// Vitest runs without globals, so Testing Library's automatic cleanup is registered here.
afterEach(() => cleanup());

// The two DOM matchers these tests need (instead of a jest-dom dependency).
const disabled = (element: unknown) => element instanceof HTMLElement && (element as HTMLButtonElement).disabled === true;
expect.extend({
  toBeDisabled: (received: unknown) => ({ pass: disabled(received), message: () => "expected the element to be disabled" }),
  toBeEnabled: (received: unknown) => ({ pass: received instanceof HTMLElement && !disabled(received), message: () => "expected the element to be enabled" }),
});
declare module "vitest" {
  // Same type parameters as Vitest's own declaration (required for the merge).
  interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown> {
    toBeDisabled: () => R;
    toBeEnabled: () => R;
  }
}

// jsdom has no layout: `(min-width: Npx)` media queries are answered from window.innerWidth so layouts can be tested at a chosen width.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    return {
      matches: min ? window.innerWidth >= Number(min[1]) : false,
      media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    } as MediaQueryList;
  };
}
