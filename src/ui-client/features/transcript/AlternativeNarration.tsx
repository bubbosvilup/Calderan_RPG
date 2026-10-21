import { useId, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestAlternative } from "../../api/alternatives";
import { queryKeys } from "../../api/queryKeys";
import type { AlternateModelDto, NarratorAlternativeDto, TranscriptMessage } from "../../api/types";
import { Button } from "../../components/Button/Button";
import { errorMessage } from "../../state/serverState";
import { parseStoryText } from "./rpgText";
import styles from "./Transcript.module.css";

/**
 * Narrator comparison (a developer aid): ask another model to narrate the same turn and read it next to the real one. It is comparison only.
 * Nothing here is written to the story, the campaign or the revision, and the request goes out only when the player presses the button
 * (it may use a paid provider). The alternatives shown are the server's: a successful request refreshes the session read model that carries them.
 */
export function AlternativeNarration({ message, models }: { readonly message: TranscriptMessage; readonly models: readonly AlternateModelDto[] }) {
  const client = useQueryClient();
  const [model, setModel] = useState("");
  const selectId = useId();
  const comparisonId = message.comparison_id;
  const ask = useMutation<readonly NarratorAlternativeDto[], Error, string>({
    mutationKey: ["alternative", comparisonId],
    mutationFn: chosen => requestAlternative({ messageId: comparisonId!, model: chosen }),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.session }),
  });
  const alternatives = message.alternatives ?? [];
  if (!comparisonId) return null;
  return (
    <div className={styles.alternatives}>
      {message.comparison_available && models.length ? (
        <details className={styles.compare}>
          <summary>Compare with another model</summary>
          <div className={styles.compareRow}>
            <label htmlFor={selectId} className="sr-only">Model for the comparison</label>
            <select id={selectId} className={styles.compareSelect} value={model} disabled={ask.isPending} onChange={event => setModel(event.target.value)}>
              <option value="">Choose a model…</option>
              {models.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <Button size="sm" disabled={!model || ask.isPending} onClick={() => ask.mutate(model)}>{ask.isPending ? "Generating…" : "Generate comparison"}</Button>
          </div>
          <small className={styles.compareNote}>Comparison only: it does not change the story. It may call a paid model.</small>
          {ask.isError ? <small className={styles.compareError} role="alert">{errorMessage(ask.error, "Alternative failed. Choose the model again to retry.")}</small> : null}
        </details>
      ) : null}
      {alternatives.map(alternative => <Alternative key={alternative.model} alternative={alternative} />)}
    </div>
  );
}

function Alternative({ alternative }: { readonly alternative: NarratorAlternativeDto }) {
  const segments = useMemo(() => parseStoryText(alternative.text), [alternative.text]);
  return (
    <section className={styles.alternative} aria-label={`Alternative narration by ${alternative.label}`}>
      <span className={styles.speaker}>Alternative · {alternative.label}</span>
      <small className={styles.compareNote}>Comparison only · Does not change the story</small>
      <p className={styles.text}>
        {segments.map((segment, index) => <span key={index} className={segment.kind === "narration" ? styles.narration : styles.dialogue}>{segment.text}</span>)}
      </p>
    </section>
  );
}
