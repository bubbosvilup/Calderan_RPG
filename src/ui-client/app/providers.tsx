import { useState, type ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { AnnouncerProvider } from "../hooks/announcer";
import { createQueryClient } from "./queryClient";

/** App-wide providers: server state (TanStack Query) and the polite announcer. Tests pass their own client. */
export function AppProviders({ children, client }: { readonly children: ReactNode; readonly client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>{children}</AnnouncerProvider>
    </QueryClientProvider>
  );
}
