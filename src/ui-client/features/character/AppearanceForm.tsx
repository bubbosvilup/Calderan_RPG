import { useId, useState } from "react";
import { refusedField, type ProfilePatch } from "../../api/player";
import type { SessionPayload } from "../../api/types";
import { Alert } from "../../components/Alert/Alert";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { errorMessage, useSessionAction } from "../../state/serverState";
import { GROUPS, profilePatch, type FormField } from "./appearanceFields";
import styles from "./Character.module.css";

/**
 * The player's profile and visible appearance. Every input shows the draft if the player has typed in it, otherwise the value the server has
 * saved: no copy of server state is kept. Unsaved changes are announced and Save is explicit; nothing is optimistic, and after a save the
 * drafts are dropped so the form shows exactly what the server returned. A refusal keeps the drafts and names the field the server pointed at.
 */
export function AppearanceForm({ fields, blockedReason, save: saveRequest, label = "Profile and appearance" }: {
  readonly fields: readonly FormField[];
  readonly blockedReason: string | null;
  /** The one request that stores a patch (the player's profile or an NPC+'s appearance); it carries the revision the page rendered. */
  readonly save: (patch: ProfilePatch, revision: number) => Promise<{ readonly state: SessionPayload | null }>;
  readonly label?: string;
}) {
  const [edits, setEdits] = useState<Readonly<Record<string, string>>>({});
  const [failure, setFailure] = useState<{ readonly message: string; readonly field: string | null } | null>(null);
  const formId = useId();
  const save = useSessionAction("profile", (patch: ProfilePatch, revision) => saveRequest(patch, revision));
  const { patch, invalid } = profilePatch(fields, edits);
  const changes = Object.keys(patch).length;
  const dirty = changes > 0 || invalid.length > 0;
  const value = (field: FormField) => edits[field.key] ?? field.stored ?? "";
  const onSave = () => {
    if (save.isPending || !changes || invalid.length) return;
    setFailure(null);
    // mutateAsync settles whatever happens to the observer (mutate's own callbacks are dropped when the page re-renders around them).
    save.mutateAsync(patch).then(
      () => setEdits({}),
      (error: unknown) => setFailure({ message: errorMessage(error, "The profile was not saved. Nothing changed."), field: refusedField(error) }));
  };
  const disabledReason = save.isPending ? "Saving…" : blockedReason;
  return (
    <form className={styles.form} aria-label={label} onSubmit={event => { event.preventDefault(); onSave(); }}>
      {GROUPS.map(group => {
        const members = fields.filter(field => field.group === group.id);
        if (!members.length) return null;
        return (
          <fieldset key={group.id} className={styles.fieldset}>
            <legend className={styles.legend}>{group.title}</legend>
            {members.map(field => {
              const id = `${formId}-${field.key}`, noteId = `${id}-note`;
              const bad = invalid.includes(field.key) ? "Enter a whole number." : failure?.field === field.key ? failure.message : null;
              const common = { id, value: value(field), "aria-invalid": bad ? true : undefined, "aria-describedby": bad || field.stored !== null || field.inherited ? noteId : undefined, className: styles.input,
                onChange: (event: { readonly target: { readonly value: string } }) => setEdits(current => ({ ...current, [field.key]: event.target.value })) };
              return (
                <div key={field.key} className={styles.field}>
                  <label htmlFor={id} className={styles.fieldLabel}>{field.label}{field.unit ? ` (${field.unit})` : ""}{field.kind === "lines" ? " (one per line)" : ""}</label>
                  {field.kind === "lines" || field.group === "description"
                    ? <textarea {...common} rows={field.kind === "lines" ? 3 : 4} />
                    : <input {...common} type="text" inputMode={field.kind === "number" ? "numeric" : "text"} autoComplete="off" />}
                  {bad ? <small id={noteId} className={styles.fieldError} role="alert">{bad}</small>
                    : field.stored !== null ? <small id={noteId} className={styles.hint}>Saved value. Empty it to clear.</small>
                    : field.inherited ? <small id={noteId} className={styles.hint}>Reference only, not saved: {field.inherited}</small> : null}
                </div>
              );
            })}
          </fieldset>
        );
      })}
      {failure && !failure.field ? <Alert tone="error">{failure.message}</Alert> : null}
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" disabled={!changes || invalid.length > 0 || !!disabledReason} aria-describedby={disabledReason ? `${formId}-reason` : undefined}>{save.isPending ? "Saving…" : "Save changes"}</Button>
        <Button disabled={!dirty || save.isPending} onClick={() => { setEdits({}); setFailure(null); }}>Discard changes</Button>
        <span role="status" className={styles.dirty}>{dirty ? <Badge tone="accent">Unsaved changes</Badge> : null}</span>
        {disabledReason && changes ? <small id={`${formId}-reason`} className={styles.hint}>{disabledReason}</small> : null}
      </div>
    </form>
  );
}
