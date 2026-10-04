import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retryAfterMs,rateDelay,launchDelay,canWait} from './reliability-v3-policy.mjs';
const p={rate_base_backoff_ms:6000,rate_max_backoff_ms:12000,minimum_launch_spacing_ms:1000,post_completion_gap_ms:250};
test('Retry-After seconds/date, expired and malformed headers',()=>{assert.equal(retryAfterMs('3',1000),3000);assert.equal(retryAfterMs('1.5',1000),1500);assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:00:10 GMT',1000),9000);assert.equal(retryAfterMs('Thu, 01 Jan 1970 00:00:00 GMT',1000),0);assert.equal(retryAfterMs('bogus',1000),null);assert.equal(retryAfterMs(null,1000),null);});
test('429 respects header without truncation; fallback exponential bounded',()=>{assert.equal(rateDelay(p,1,'130',0),130000);assert.equal(rateDelay(p,1,'1',0),1000);assert.equal(rateDelay(p,1,null,0),6000);assert.equal(rateDelay(p,2,null,0),12000);assert.equal(rateDelay(p,3,null,0),12000);});
test('dispatch obeys completion gap, launch interval and shared cooldown',()=>{assert.equal(launchDelay(p,2000,1000,1950,0),200);assert.equal(launchDelay(p,1200,1000,1100,0),800);assert.equal(launchDelay(p,2000,1000,1950,8000),6000);assert.equal(launchDelay(p,9000,1000,1950,8000),0);});
test('no retry/dispatch when honoring delay would consume budget',()=>{assert.equal(canWait(130000,120000,5000),false);assert.equal(canWait(6000,11000,5000),true);assert.equal(canWait(6000,10999,5000),false);assert.equal(canWait(Infinity,120000,5000),false);});
