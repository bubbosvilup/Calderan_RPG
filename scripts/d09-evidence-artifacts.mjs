/** Evaluation-only, append-only physical request bookkeeping. No provider dependencies. */
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const suffix = id => String(id).padStart(3, '0');
const encode = value => JSON.stringify(value, null, 2) + '\n';
const index = name => /^(request|receipt|interrupted)-(\d+)\.json$/.exec(name);

export class EvidenceArtifactStore {
  #next;
  #submissionNext;
  constructor(directory, maximum, maximumSubmission) { this.directory = directory; this.#next = maximum + 1; this.#submissionNext = maximumSubmission + 1; }
  static async open(directory, {mark_pending_on_resume = false} = {}) {
    await mkdir(directory, {recursive: true});
    const names = await readdir(directory);
    const maximum = Math.max(0, ...names.map(index).filter(Boolean).map(m => Number(m[2])));
    if (!Number.isSafeInteger(maximum)) throw Error('Unsafe captured request index');
    const maximumSubmission = Math.max(0, ...names.map(name=>/^submission-(\d+)\.json$/.exec(name)).filter(Boolean).map(m=>Number(m[1])));
    const store = new EvidenceArtifactStore(directory, maximum, maximumSubmission);
    if (mark_pending_on_resume) {
      const audit = await store.audit();
      if (audit.errors.length) throw Error(`Evidence integrity: ${audit.errors.join('; ')}`);
      for (const id of audit.pending_requests) await store.markInterrupted(id, 'Pending at resume; completion and billing UNKNOWN until a receipt exists.');
    }
    return store;
  }
  get maxCapturedRequestIndex() { return this.#next - 1; }
  async recordSubmission(value, maximum = 8) {
    if (!Number.isSafeInteger(maximum) || maximum < 1 || 'id' in value) throw Error('Invalid submission budget or supplied ID');
    for (;;) {
      const id=this.#submissionNext++;
      if (id>maximum) throw Error('Submission budget reached; failed and interrupted attempts count');
      try {
        const submission={...value,id};
        await writeFile(join(this.directory,`submission-${suffix(id)}.json`),encode(submission),{flag:'wx'});
        return submission;
      } catch (error) { if (error.code!=='EEXIST') throw error; }
    }
  }
  async recordRequest(value) {
    if ('id' in value) throw Error('Physical IDs are allocated by the artifact store');
    for (;;) {
      const id = this.#next++;
      if (!Number.isSafeInteger(id)) throw Error('Request index overflow');
      const request = {...value, id, body_sha: value.body_sha ?? createHash('sha256').update(JSON.stringify(value.body)).digest('hex')};
      try {
        await writeFile(join(this.directory, `request-${suffix(id)}.json`), encode(request), {flag: 'wx'});
        return request;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        // Another writer/resume captured this ID. Never overwrite, and never dispatch it twice.
      }
    }
  }
  async recordReceipt(receipt) {
    const request = JSON.parse(await readFile(join(this.directory, `request-${suffix(receipt.id)}.json`), 'utf8'));
    if (request.id !== receipt.id || request.role !== receipt.role || request.turn !== receipt.turn) throw Error('Receipt/request identity mismatch');
    await writeFile(join(this.directory, `receipt-${suffix(receipt.id)}.json`), encode(receipt), {flag: 'wx'});
  }
  async readReceipts() {
    const audit=await this.audit();
    if (audit.errors.length) throw Error(`Evidence integrity: ${audit.errors.join('; ')}`);
    return Promise.all(audit.receipts.map(id=>readFile(join(this.directory,`receipt-${suffix(id)}.json`),'utf8').then(JSON.parse)));
  }
  async markInterrupted(id, reason) {
    const request = JSON.parse(await readFile(join(this.directory, `request-${suffix(id)}.json`), 'utf8'));
    try {
      await writeFile(join(this.directory, `interrupted-${suffix(id)}.json`), encode({id, role: request.role, turn: request.turn, reason, status: 'PENDING_AT_RESUME', billing: 'UNKNOWN'}), {flag: 'wx'});
    } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  async audit() {
    const names = await readdir(this.directory), records = {request: new Map(), receipt: new Map(), interrupted: new Map()}, errors = [];
    for (const name of names.sort()) {
      const match = index(name); if (!match) continue;
      const kind = match[1], id = Number(match[2]);
      if (records[kind].has(id)) errors.push(`Duplicate ${kind} index ${id}`);
      try {
        const value = JSON.parse(await readFile(join(this.directory, name), 'utf8'));
        if (value.id !== id) errors.push(`Filename/payload identity mismatch: ${name}`);
        records[kind].set(id, value);
      } catch { errors.push(`Unreadable ${name}; preserved reservation must not be reused`); }
    }
    for (const [id, receipt] of records.receipt) {
      const request = records.request.get(id);
      if (!request) errors.push(`Orphan receipt ${id}`);
      else if (request.role !== receipt.role || request.turn !== receipt.turn) errors.push(`Receipt/request identity mismatch ${id}`);
    }
    for (const id of records.interrupted.keys()) if (!records.request.has(id)) errors.push(`Orphan interruption ${id}`);
    return {errors, requests: [...records.request.keys()].sort((a,b)=>a-b), receipts: [...records.receipt.keys()].sort((a,b)=>a-b),
      pending_requests: [...records.request.keys()].filter(id => !records.receipt.has(id)).sort((a,b)=>a-b),
      interrupted_requests: [...records.interrupted.keys()].sort((a,b)=>a-b),
      completed_after_resume: [...records.interrupted.keys()].filter(id => records.receipt.has(id)),
      max_captured_request_index: Math.max(0, ...records.request.keys()), one_to_one_receipts: errors.length === 0};
  }
}
