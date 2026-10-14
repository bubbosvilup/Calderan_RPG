import { usePlaySession } from "../../state/playSession";
import { SessionPage } from "../session/SessionPage";
import { PlayerCharacterPage } from "./PlayerCharacterPage";

/** `…/character/player`: the player character's page in the open session. */
export function PlayerCharacterRoute() {
  const { session } = usePlaySession();
  return <SessionPage session={session} title="Player character"><PlayerCharacterPage session={session} /></SessionPage>;
}
