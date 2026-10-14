import { useSyncExternalStore } from "react";

/** Live `matchMedia` result (false where the API does not exist, e.g. some test environments). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    notify => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
    () => false,
  );
}
