import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

/**
 * B3 (UI-1): the character drawer's keyboard cycle. Tab and Shift-Tab stay inside the drawer and reach Promote and its inline confirmation
 * whenever they are shown; Escape closes the drawer. The real client against a minimal DOM stand-in that tracks focus.
 */
class Element {
  private text = "";
  id = ""; className = ""; value = ""; hidden = false; disabled = false; type = ""; scrollTop = 0; scrollHeight = 100; clientHeight = 100;
  parent?: Element; children: Element[] = []; dataset: Record<string, string> = {};
  attributes = new Map<string, string>(); handlers = new Map<string, (event: any) => any>();
  constructor(private readonly doc: { activeElement?: Element }) {}
  get textContent(): string { return this.text + this.children.map(c => c.textContent).join(""); }
  set textContent(value: string) { this.text = value; this.children = []; }
  append(...children: Element[]) { children.forEach(c => { c.parent = this; }); this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.text = ""; this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name); }
  addEventListener(name: string, handler: (event: any) => any) { this.handlers.set(name, handler); }
  focus() { this.doc.activeElement = this; }
  classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function drawer() {
  const doc: { activeElement?: Element } = {}, nodes = new Map<string, Element>();
  const node = (selector: string) => { let e = nodes.get(selector); if (!e) { e = new Element(doc); e.id = selector.replace(/^#/, ""); nodes.set(selector, e); } return e; };
  const context: any = { document: { querySelector: node, querySelectorAll: () => [], createElement: () => new Element(doc), get activeElement() { return doc.activeElement; } },
    fetch: async () => ({ ok: true, json: async () => ({ messages: [], status: "idle", configured: true, revision: 1 }) }), setTimeout, clearTimeout, TextDecoder };
  runInNewContext(await readFile("src/ui/client.js", "utf8"), context); await tick();
  const id = (name: string) => node(`#${name}`);
  const key = (k: string, shiftKey = false) => { let prevented = false; id("character-drawer").handlers.get("keydown")!({ key: k, shiftKey, target: doc.activeElement, preventDefault() { prevented = true; } }); return prevented; };
  const focused = () => doc.activeElement?.id;
  return { id, key, focused };
}

test("without Promote the cycle is close, Appearance, Story and wraps both ways", async () => {
  const d = await drawer();
  d.id("character-promote").hidden = true; d.id("character-close").focus();
  const order = [d.focused()]; for (let k = 0; k < 3; k++) { d.key("Tab"); order.push(d.focused()); }
  assert.deepEqual(order, ["character-close", "appearance-tab", "story-tab", "character-close"]);
  d.key("Tab", true); assert.equal(d.focused(), "story-tab");
});

test("Promote is reachable by Tab, and so are Cancel and Promote of the open confirmation; Shift-Tab walks back", async () => {
  const d = await drawer();
  d.id("character-promote").hidden = false; d.id("character-promote-confirm").hidden = true; d.id("character-close").focus();
  assert.equal(d.key("Tab"), true); assert.equal(d.focused(), "character-promote-button");
  // The confirmation is open: the arrow is hidden and its two buttons join the cycle in document order.
  d.id("character-promote-button").hidden = true; d.id("character-promote-confirm").hidden = false; d.id("character-close").focus();
  const order = [d.focused()]; for (let k = 0; k < 4; k++) { d.key("Tab"); order.push(d.focused()); }
  assert.deepEqual(order, ["character-close", "character-promote-cancel", "character-promote-confirm-button", "appearance-tab", "story-tab"]);
  d.key("Tab", true); d.key("Tab", true); assert.equal(d.focused(), "character-promote-confirm-button");
  // A disabled control (a request in flight) is skipped, never a focus trap.
  d.id("character-promote-confirm-button").disabled = true; d.id("character-promote-cancel").focus(); d.key("Tab"); assert.equal(d.focused(), "appearance-tab");
});

test("Escape closes the drawer", async () => {
  const d = await drawer();
  d.id("character-overlay").hidden = false; d.id("character-close").focus();
  assert.equal(d.key("Escape"), true); assert.equal(d.id("character-overlay").hidden, true);
});
