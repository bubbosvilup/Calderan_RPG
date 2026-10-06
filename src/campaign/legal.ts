import type { CampaignCommand, CounterpartySnapshot, PersonLegalState } from "./types.js";
import type { PreparationContext } from "./preparation.js";
import { worldMinute } from "./preparation.js";
import { fail } from "./validation.js";

/**
 * Household Pass 1: money, person legal status and atomic person transactions. A person is not an item: legal status lives in
 * its own domain (status, single legal holder, transfer papers), never in inventory positions. Every transaction is validated
 * against the draft and applied inside one preparation, so a failure anywhere throws before commit: money never moves without
 * ownership, ownership never moves without payment. Transaction IDs are recorded, so a replayed command is rejected.
 */
export function prepareLegalCommand(context: PreparationContext, command: CampaignCommand): boolean {
  const { draft, refs } = context;
  const legal = (id: string) => draft.legal_statuses.find(l => l.character_id === id);
  const funds = (id: string) => draft.funds.find(f => f.character_id === id);
  const newTransaction = (id: string) => { refs.newId(id, "transaction"); };
  // Applied at the next revision; draft.revision still holds the base revision during preparation.
  const nextRevision = () => draft.revision + 1;
  switch (command.kind) {
    case "set_funds": {
      refs.character(command.character_id);
      const prior = funds(command.character_id);
      if (prior) prior.gold = command.gold; else draft.funds.push({ character_id: command.character_id, gold: command.gold });
      return true;
    }
    case "set_price_index": {
      // P8: generated once per campaign; a second assignment would be a reroll.
      refs.character(command.character_id);
      const indices = draft.price_indices ??= [];
      if (indices.some(p => p.character_id === command.character_id)) fail("character_id", "price index already established");
      indices.push({ character_id: command.character_id, percent: command.percent });
      return true;
    }
    case "set_legal_status": {
      refs.character(command.character_id);
      if (command.status === "enslaved") {
        if (!command.holder_id) fail("holder_id", "an enslaved person needs a legal holder");
        refs.character(command.holder_id);
        if (command.holder_id === command.character_id) fail("holder_id", "a person cannot hold themselves");
      } else if (command.holder_id !== undefined) fail("holder_id", "a free person has no legal holder");
      const record: PersonLegalState = { character_id: command.character_id, status: command.status, ...(command.holder_id ? { holder_id: command.holder_id } : {}),
        ...(command.documentation ? { transfer: { documentation: command.documentation, ...(command.note ? { note: command.note } : {}) } } : {}) };
      draft.legal_statuses = [...draft.legal_statuses.filter(l => l.character_id !== command.character_id), record];
      return true;
    }
    case "transfer_person": {
      newTransaction(command.transaction_id);
      if ((command.from_holder_id === undefined) === (command.from_counterparty === undefined)) fail("from_holder_id", "a transfer has exactly one seller: a legal holder or an anonymous counterparty");
      if (command.from_counterparty) return anonymousSale(context, command, command.from_counterparty);
      refs.character(command.character_id); refs.character(command.from_holder_id!); refs.character(command.to_holder_id);
      const subject = legal(command.character_id);
      if (!subject || subject.status !== "enslaved") fail("character_id", "subject is not legally transferable");
      if (subject.holder_id !== command.from_holder_id) fail("from_holder_id", "transferring party is not the current legal holder");
      if (command.to_holder_id === command.from_holder_id) fail("to_holder_id", "transfer to the same holder");
      if (command.to_holder_id === command.character_id || command.from_holder_id === command.character_id) fail("to_holder_id", "a person cannot hold themselves");
      const p = command.payment;
      if (command.transaction_kind === "sale") {
        if (!p) fail("payment", "a sale requires payment");
        if (p.payee_id === undefined) fail("payment.payee_id", "a sale by a legal holder pays that holder");
        if (p.payer_id !== command.to_holder_id || p.payee_id !== command.from_holder_id) fail("payment", "a sale is paid by the new holder to the current holder");
      } else if (p) fail("payment", "only a sale carries payment");
      if (p) {
        refs.character(p.payer_id); refs.character(p.payee_id!);
        const payer = funds(p.payer_id);
        if (!payer) fail("payment.payer_id", "payer has no tracked funds");
        if (payer.gold < p.gold) fail("payment.gold", "insufficient funds");
        payer.gold -= p.gold;
        // A payee without a tracked purse receives the coin outside the tracked economy.
        const payee = funds(p.payee_id!); if (payee) payee.gold += p.gold;
      }
      subject.holder_id = command.to_holder_id;
      subject.transfer = { documentation: command.documentation, from_holder_id: command.from_holder_id!, transaction_id: command.transaction_id, ...(command.note ? { note: command.note } : {}) };
      draft.transactions.push({ id: command.transaction_id, kind: command.transaction_kind, subject_id: command.character_id, from_holder_id: command.from_holder_id!, to_holder_id: command.to_holder_id,
        ...(p ? { payer_id: p.payer_id, payee_id: p.payee_id!, gold: p.gold } : {}), documentation: command.documentation, world_minute: worldMinute(context), revision: nextRevision() });
      return true;
    }
    case "manumit": {
      newTransaction(command.transaction_id);
      refs.character(command.character_id); refs.character(command.by_holder_id);
      const subject = legal(command.character_id);
      if (!subject || subject.status !== "enslaved") fail("character_id", "only an enslaved person can be manumitted");
      if (subject.holder_id !== command.by_holder_id) fail("by_holder_id", "only the current legal holder can manumit");
      // Enslaved → free only. Household membership, location and relationships are other dimensions and stay untouched.
      subject.status = "free"; delete subject.holder_id;
      subject.transfer = { documentation: command.documentation, from_holder_id: command.by_holder_id, transaction_id: command.transaction_id, ...(command.note ? { note: command.note } : {}) };
      draft.transactions.push({ id: command.transaction_id, kind: "manumission", subject_id: command.character_id, from_holder_id: command.by_holder_id, documentation: command.documentation, world_minute: worldMinute(context), revision: nextRevision() });
      return true;
    }
    default: return false;
  }
}

/**
 * Pass 1.2: sale by an anonymous narrator-created seller ("the whittler"). The seller is never made a character to satisfy the
 * holder field: the subject must have NO legal record (nobody in campaign state holds them), and the sale writes the post-sale legal
 * state directly (enslaved, holder = buyer) with the seller preserved as a counterparty snapshot in the ledger. Payment leaves the
 * tracked economy (no payee). Everything is validated in the same preparation, so any failure changes nothing.
 */
function anonymousSale(context: PreparationContext, command: Extract<CampaignCommand, { kind: "transfer_person" }>, seller: CounterpartySnapshot): boolean {
  const { draft, refs } = context;
  refs.character(command.character_id); refs.character(command.to_holder_id); refs.location(seller.location_id);
  if (command.transaction_kind !== "sale") fail("transaction_kind", "an anonymous counterparty can only sell");
  if (command.to_holder_id === command.character_id) fail("to_holder_id", "a person cannot hold themselves");
  if (draft.legal_statuses.some(l => l.character_id === command.character_id)) fail("character_id", "a person with an established legal status can only be transferred by their legal holder");
  const p = command.payment;
  if (!p) fail("payment", "a sale requires payment");
  if (p.payer_id !== command.to_holder_id || p.payee_id !== undefined) fail("payment", "an anonymous sale is paid by the buyer, outside the tracked economy");
  const payer = draft.funds.find(f => f.character_id === p.payer_id);
  if (!payer) fail("payment.payer_id", "payer has no tracked funds");
  if (payer.gold < p.gold) fail("payment.gold", "insufficient funds");
  payer.gold -= p.gold;
  draft.legal_statuses.push({ character_id: command.character_id, status: "enslaved", holder_id: command.to_holder_id,
    transfer: { documentation: command.documentation, transaction_id: command.transaction_id, ...(command.note ? { note: command.note } : {}) } });
  draft.transactions.push({ id: command.transaction_id, kind: "sale", subject_id: command.character_id, from_counterparty: seller, to_holder_id: command.to_holder_id,
    payer_id: p.payer_id, gold: p.gold, documentation: command.documentation, world_minute: worldMinute(context), revision: draft.revision + 1 });
  return true;
}
