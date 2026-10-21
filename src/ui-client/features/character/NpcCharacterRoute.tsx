import { useParams } from "react-router";
import { usePlaySession } from "../../state/playSession";
import { findCharacterCard } from "../characters/CharacterSidebar";
import { SessionPage } from "../session/SessionPage";
import { NpcCharacterPage } from "./NpcCharacterPage";

/** `…/characters/<ref>`: the editor page of one NPC+ of the open session. The ref is looked up in the read model, never interpreted. */
export function NpcCharacterRoute() {
  const { session } = usePlaySession();
  const { characterRef } = useParams();
  const card = characterRef ? findCharacterCard(session, characterRef) : null;
  return <SessionPage session={session} title={card?.name ?? "Character"}><NpcCharacterPage session={session} card={card} /></SessionPage>;
}
