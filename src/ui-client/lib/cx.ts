/** Joins CSS Module class names, dropping the falsy ones (a missing module key is `undefined`, never the string "undefined"). */
export const cx = (...names: readonly (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");
