import { usePlaySession } from "../../state/playSession";
import { PlayScreen } from "./PlayScreen";

/** The story page of the open session (the index route under the play route). */
export function PlayPage() {
  const { session, connectionLost, draftRef } = usePlaySession();
  return <PlayScreen session={session} connectionLost={connectionLost} draftRef={draftRef} />;
}
