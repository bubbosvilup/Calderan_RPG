import { useId } from "react";
import { Link } from "react-router";
import type { PlayerCharacterDto } from "../../api/types";
import { Avatar } from "../../components/Avatar/Avatar";
import styles from "./PlayerSummary.module.css";

/** The player character at a glance: name, selected avatar and gold. `gold === null` means money is not tracked (not zero). */
export function PlayerSummary({ player, gold, characterHref, inventoryHref }: {
  readonly player: PlayerCharacterDto | null;
  readonly gold: number | null;
  /** The player character page and the inventory page of this session. */
  readonly characterHref: string;
  readonly inventoryHref: string;
}) {
  const headingId = useId();
  const name = player?.name ?? "You";
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.identity}>
        <Avatar url={player?.visual?.avatar_url ?? null} name={name} size="lg" />
        <div className={styles.text}>
          <h2 id={headingId} className={styles.name}>{name}</h2>
          <small className={styles.role}>{player?.role_label ?? "Player Character"}</small>
        </div>
      </div>
      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dt>Gold</dt>
          <dd className={gold === null ? styles.untracked : styles.gold} data-testid="player-gold">{gold === null ? "Not tracked" : gold}</dd>
        </div>
      </dl>
      <nav className={styles.links} aria-label="Player pages">
        <Link to={characterHref}>Character</Link>
        <Link to={inventoryHref}>Inventory</Link>
      </nav>
    </section>
  );
}
