/** Evaluation-only Alibaba dispatch arithmetic. No content/semantic behavior. */
export function retryAfterMs(value,nowMs){if(value===null||value===undefined||String(value).trim()==='')return null;const s=String(value).trim();if(/^\d+(\.\d+)?$/.test(s))return Number(s)*1000;const date=Date.parse(s);return Number.isFinite(date)?Math.max(0,date-nowMs):null;}
export function rateDelay(policy,attempt,header,nowMs){const parsed=retryAfterMs(header,nowMs);return parsed!==null?parsed:Math.min(policy.rate_max_backoff_ms,policy.rate_base_backoff_ms*2**Math.max(0,attempt-1));}
export function launchDelay(policy,now,lastLaunch,lastEnd,cooldownUntil){return Math.max(0,lastLaunch+policy.minimum_launch_spacing_ms-now,lastEnd+policy.post_completion_gap_ms-now,cooldownUntil-now);}
export function canWait(delay,remaining,minimumWindow){return Number.isFinite(delay)&&delay>=0&&remaining-delay>=minimumWindow;}
