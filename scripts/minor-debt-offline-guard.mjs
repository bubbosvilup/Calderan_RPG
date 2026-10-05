import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
// Required suites may install their own deterministic fetch stubs. Real transport is forbidden.
const blocked = () => { throw new Error('Minor debt sweep: real network transport is disabled'); };
globalThis.fetch = blocked;
http.request = http.get = https.request = https.get = net.connect = net.createConnection = blocked;
syncBuiltinESMExports();
