/** Audit a clone concurrently. Never await it before returning the original response to transport. */
export function passiveResponseAudit(response:Response,sink:(raw:string)=>Promise<void>):Promise<void> {
  // Attach immediately: transport cleanup may abort the clone long before the final flush attaches allSettled.
  // Audit failure must never terminate generation or erase the separately persisted provider result.
  return response.clone().text().then(sink).catch(() => undefined);
}
export async function finishPassiveAudits(writes:readonly Promise<void>[],timeout_ms=1000):Promise<void> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {await Promise.race([Promise.allSettled(writes),new Promise<void>(resolve=>{timer=setTimeout(resolve,timeout_ms);})]);}
  finally{clearTimeout(timer);}
}
