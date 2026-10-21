import { Link } from "react-router";
import type { CharacterCardDto } from "../../api/types";
import { Avatar } from "../../components/Avatar/Avatar";
import { Badge } from "../../components/Badge/Badge";
import { Drawer } from "../../components/Drawer/Drawer";
import { Tabs } from "../../components/Tabs/Tabs";
import { PromoteControl } from "./PromoteControl";
import styles from "./Characters.module.css";

const factStatus = (status: string) => (status === "knows" ? "Known" : status.replace(/_/g, " "));

/**
 * Details of one character, limited to what the player character knows (the read model is already scoped). Personality and relations tabs
 * are later phases. The drawer closes itself when the character leaves the read model.
 */
export function CharacterDrawer({ card, playerName, onClose, blockedReason, returnFocus, editHref = null }: {
  readonly card: CharacterCardDto | null;
  readonly playerName: string;
  readonly onClose: () => void;
  readonly blockedReason: string | null;
  readonly returnFocus?: () => HTMLElement | null;
  /** The NPC+ editor page, offered only when the engine's capability says this character is editable now. */
  readonly editHref?: string | null;
}) {
  return (
    <Drawer open={!!card} onClose={onClose} title={card?.name ?? ""} eyebrow="Character" footer={`Showing only what ${playerName} knows`} {...(returnFocus ? { returnFocus } : {})}>
      {card ? <CharacterDetails card={card} playerName={playerName} blockedReason={blockedReason} editHref={editHref} /> : null}
    </Drawer>
  );
}

function CharacterDetails({ card, playerName, blockedReason, editHref }: { readonly card: CharacterCardDto; readonly playerName: string; readonly blockedReason: string | null; readonly editHref: string | null }) {
  return (
    <div className={styles.details}>
      <div className={styles.overview}>
        <Avatar url={card.avatar_url} name={card.name} nameKnown={card.name_known} size="lg" />
        <div className={styles.overviewText}>
          <div className={styles.badges}>
            {card.household ? <Badge>Household</Badge> : null}
            {card.npc_plus ? <Badge tone="accent">NPC+</Badge> : null}
          </div>
          <small className={styles.detail}>{card.category}</small>
        </div>
      </div>
      <PromoteControl card={card} blockedReason={blockedReason} />
      {editHref ? <Link to={editHref} className={styles.editLink}>Edit appearance and portraits</Link>
        : card.npc_plus && card.character_capabilities.edit_unavailable_reason ? <p className={styles.muted}>{card.character_capabilities.edit_unavailable_reason}</p> : null}
      <dl className={styles.facts}>
        <dt>Known role</dt><dd>{card.role}</dd>
        <dt>With {playerName}</dt><dd>{card.relationship}</dd>
        <dt>State</dt><dd>{card.state}</dd>
        <dt>Where</dt><dd>{card.where}</dd>
      </dl>
      <Tabs
        label="Character details"
        items={[
          { id: "appearance", label: "Appearance", content: (
            <>
              <DetailBlock title="Permanent appearance">{card.appearance}</DetailBlock>
              <DetailBlock title="Affiliations">{card.affiliations.length ? card.affiliations.join(" · ") : "None known."}</DetailBlock>
            </>
          ) },
          { id: "story", label: "Story & knowledge", content: (
            <>
              <DetailBlock title="Public summary">{card.public_summary ?? "No public summary recorded."}</DetailBlock>
              <DetailList title="Known story facts" empty="No learned story facts recorded." items={card.story_facts.map(f => `${factStatus(f.status)}: ${f.text}`)} />
              <DetailList title="Known history" empty="No known history recorded." items={card.history.map(h => `${h.source}: ${h.text}`)} />
              <DetailList title="Known observations" empty="No recognized observations recorded." items={card.observations} />
              <DetailBlock title="Knowledge boundary">{card.knowledge_boundary}</DetailBlock>
            </>
          ) },
        ]}
      />
    </div>
  );
}

function DetailBlock({ title, children }: { readonly title: string; readonly children: string }) {
  return <section className={styles.block}><h3 className={styles.subheading}>{title}</h3><p className={styles.prose}>{children}</p></section>;
}

function DetailList({ title, items, empty }: { readonly title: string; readonly items: readonly string[]; readonly empty: string }) {
  return (
    <section className={styles.block}>
      <h3 className={styles.subheading}>{title}</h3>
      {items.length ? <ul className={styles.proseList}>{items.map((item, index) => <li key={index} className={styles.prose}>{item}</li>)}</ul> : <p className={styles.muted}>{empty}</p>}
    </section>
  );
}
