import { requestJson } from "./client";
import type { OptionalServicesDto } from "./types";

/** Runtime health of the optional services. Diagnostic only: it never changes the campaign or its revision. */
export const fetchOptionalServices = (signal?: AbortSignal) => requestJson<OptionalServicesDto>("/optional-services", { signal });
