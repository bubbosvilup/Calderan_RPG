/** Shared verification result; contains no authorization behavior or runtime dependency. */
export interface EvidenceCheck { readonly verified: boolean; readonly check: string }
