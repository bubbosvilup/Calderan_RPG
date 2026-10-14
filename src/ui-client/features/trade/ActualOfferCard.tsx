import { useId } from "react";
import type { TradeCardDto } from "../../api/types";
import { Button } from "../../components/Button/Button";
import { useAnnounceOnce } from "../../hooks/announcer";
import { cx } from "../../lib/cx";
import styles from "./Trade.module.css";

/**
 * The single standing trade offer, as the engine projected it. BUY and SELL differ by text and icon, not by color alone; a person offer carries
 * its own marker; every label (counterparty, subject) is already masked by the server. The card only renders and initiates: the engine
 * decides affordability, validity and settlement. There is deliberately no counteroffer control (negotiation happens in the story).
 */
export function ActualOfferCard({ offer, onAccept, pending, blockedReason, error }: {
  readonly offer: TradeCardDto;
  readonly onAccept: (ref: string) => void;
  readonly pending: boolean;
  readonly blockedReason: string | null;
  readonly error: string | null;
}) {
  const reasonId = useId(), purseId = useId();
  useAnnounceOnce(`offer:${offer.ref}`, `Actual offer: ${offer.summary}`);
  const buy = offer.direction === "buy";
  const unaffordable = offer.affordable === false;
  const reason = !unaffordable && !pending ? blockedReason : null;
  const describedBy = [unaffordable && offer.gold !== null ? purseId : "", reason ? reasonId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <section className={cx(styles.card, buy ? styles.buy : styles.sell)} aria-label={`${buy ? "Buy" : "Sell"} offer`} data-trade-ref={offer.ref}>
      <div className={styles.head}>
        <span className={styles.label}>Actual offer</span>
        <strong className={styles.direction}><span aria-hidden="true">{buy ? "▼ " : "▲ "}</span>{buy ? "BUY" : "SELL"}</strong>
        {offer.kind === "person" ? <span className={styles.person}><span aria-hidden="true">♟ </span>Person</span> : null}
        <span className={styles.price}>{offer.price_gold} gold</span>
      </div>
      <p className={styles.party}>{buy ? `${offer.counterparty} offers to sell` : `${offer.counterparty} offers to buy`}</p>
      <ul className={styles.lines}>
        {offer.lines.map((line, index) => <li key={index}>{line}</li>)}
      </ul>
      <div className={styles.foot}>
        <Button variant="primary" onClick={() => onAccept(offer.ref)} disabled={pending || unaffordable || !!blockedReason} aria-label={`Accept offer: ${offer.summary}`} aria-describedby={describedBy}>
          {pending ? "Accepting…" : "Accept offer"}
        </Button>
        {offer.gold !== null ? <span id={purseId} className={styles.purse}>{unaffordable ? `Not enough gold (you have ${offer.gold}).` : `You have ${offer.gold} gold.`}</span> : null}
        {reason ? <span id={reasonId} className={styles.reason}>{reason}</span> : null}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}
