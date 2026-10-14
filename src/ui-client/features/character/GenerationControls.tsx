import { useState } from "react";
import type { PortraitEditorDto, PortraitKindDto } from "../../api/types";
import { Button } from "../../components/Button/Button";
import { Spinner } from "../../components/Spinner/Spinner";
import { useElapsedSeconds } from "./usePortraitActions";
import styles from "./Character.module.css";

const SLOW_AFTER_SECONDS = 90;
const KINDS: readonly { readonly kind: PortraitKindDto; readonly label: string; readonly noun: string; readonly poseLabel: string }[] = [
  { kind: "avatar", label: "Avatar", noun: "avatars", poseLabel: "Avatar pose" },
  { kind: "fullbody", label: "Full body", noun: "full-body images", poseLabel: "Full body pose" },
];

/**
 * The existing image generation capability, nothing more: pick a pose from the server's list and ask for one batch of one kind. The request
 * is one synchronous server call (usually 30 to 90 seconds), so the control shows a live progress block and disables only the portrait
 * controls. What a batch costs, which model draws it and the prompt are the server's business; the browser sends a kind and a pose id.
 */
export function GenerationControls({ portrait, generating, blockedReason, onGenerate }: {
  readonly portrait: PortraitEditorDto;
  /** The kind being generated right now, or null. */
  readonly generating: PortraitKindDto | null;
  readonly blockedReason: string | null;
  readonly onGenerate: (kind: PortraitKindDto, pose: string) => void;
}) {
  const [poses, setPoses] = useState<Partial<Record<PortraitKindDto, string>>>({});
  const elapsed = useElapsedSeconds(generating !== null);
  const blocked = portrait.generation_blocked;
  const full = !portrait.can_generate_batch && !blocked;
  const note = blocked ?? (full ? "The Gallery is full. Delete some unused images first." : blockedReason);
  return (
    <div className={styles.generation}>
      {KINDS.map(({ kind, label, noun, poseLabel }) => {
        const options = portrait.poses[kind] ?? [];
        const pose = poses[kind] && options.some(o => o.id === poses[kind]) ? poses[kind]! : options[0]?.id ?? "";
        const selectId = `pose-${kind}`;
        return (
          <div key={kind} className={styles.generateRow}>
            <label htmlFor={selectId} className={styles.fieldLabel}>{poseLabel}</label>
            <select id={selectId} className={styles.select} value={pose} disabled={!!blocked || !!blockedReason} onChange={event => setPoses(current => ({ ...current, [kind]: event.target.value }))}>
              {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <Button disabled={!!blocked || full || !!blockedReason || !pose} onClick={() => onGenerate(kind, pose)}>
              {generating === kind ? `Generating ${portrait.batch_size} ${noun}…` : `Generate ${portrait.batch_size} ${noun}`}
            </Button>
            <span className="sr-only">{label}</span>
          </div>
        );
      })}
      {note ? <p className={styles.hint} id="generation-note">{note}</p> : null}
      {generating ? (
        <div className={styles.progress} role="status" aria-live="polite">
          <Spinner size="sm" />
          <div>
            <strong>Generating {portrait.batch_size} {generating === "avatar" ? "avatar" : "full-body"} images</strong>
            <p className={styles.hint}>{elapsed < 1 ? "Request sent" : elapsed >= SLOW_AFTER_SECONDS ? "Taking longer than usual. The request is still running." : "Generating…"} · {elapsed} s</p>
            <p className={styles.hint}>Image generation can take up to about a minute. You can keep reading; only the portrait controls wait.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
