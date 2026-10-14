import { useRef, useState } from "react";
import { acceptOffer } from "../../api/trade";
import type { TradeReceiptDto, TradeViewDto } from "../../api/types";
import { errorMessage, useSessionAction } from "../../state/serverState";
import { ActualOfferCard } from "./ActualOfferCard";
import styles from "./Trade.module.css";

const RECEIPTS_SHOWN = 3;

/**
 * Trade state inline after the newest message: the last receipts settled on this page, a withdrawal notice, and the standing offer. Gold,
 * inventory and characters update from the authoritative state the settlement returns (a bought person appears as a Campaign NPC).
 */
export function TradeRegion({ trade, blockedReason, onSettled }: { readonly trade: TradeViewDto; readonly blockedReason: string | null; readonly onSettled?: () => void }) {
  // Presentation memory only: which settlements this page has witnessed (the read model reports the latest one).
  const receipts = useRef<TradeReceiptDto[]>([]);
  if (trade.receipt && !receipts.current.some(r => r.ref === trade.receipt?.ref)) receipts.current = [...receipts.current, trade.receipt].slice(-RECEIPTS_SHOWN);
  const accept = useSessionAction("trade-accept", (ref: string, revision) => acceptOffer({ ref, expectedRevision: revision }));
  const [failure, setFailure] = useState<{ readonly ref: string; readonly message: string } | null>(null);
  const onAccept = (ref: string) => {
    if (accept.isPending) return;
    setFailure(null);
    accept.mutate(ref, { onError: error => setFailure({ ref, message: errorMessage(error, "The trade was not completed. Nothing changed.") }), onSettled: () => onSettled?.() });
  };
  const offer = trade.offer;
  // A refusal of an offer that has since been replaced or withdrawn stays visible above whatever stands now.
  const orphanFailure = failure && failure.ref !== offer?.ref ? failure.message : null;
  if (!offer && !trade.notice && !receipts.current.length && !orphanFailure) return null;
  return (
    <div className={styles.region}>
      {receipts.current.map(receipt => (
        <p key={receipt.ref} className={styles.receipt} data-trade-receipt={receipt.ref}><span aria-hidden="true">✓ </span>{receipt.summary}.</p>
      ))}
      {trade.notice && !offer ? <p className={styles.notice}>{trade.notice.text}</p> : null}
      {orphanFailure ? <p className={styles.error} role="alert">{orphanFailure}</p> : null}
      {offer ? (
        <ActualOfferCard offer={offer} onAccept={onAccept} pending={accept.isPending} blockedReason={accept.isPending ? null : blockedReason} error={failure?.ref === offer.ref ? failure.message : null} />
      ) : null}
    </div>
  );
}
