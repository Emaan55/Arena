import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/MobileOverlay.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
} });

// Exercise the real overlay lifecycle without adding a DOM/testing dependency.
function harness() {
  const effects = [], cleanups = [], scrolls = [];
  const globals = ["document", "window", "HTMLElement", "getComputedStyle"];
  const previousGlobals = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
  let document, closed = 0, refIndex = 0;
  class Element extends EventTarget {
    style = {};
    tabIndex = 0;
    isConnected = true;
    getClientRects() { return [{}]; }
    focus() { document.activeElement = this; }
  }
  const trigger = new Element(), first = new Element(), last = new Element(), dialog = new Element();
  dialog.querySelectorAll = () => [first, last];
  dialog.contains = (element) => [dialog, first, last].includes(element);
  document = Object.assign(new EventTarget(), { body: new Element(), documentElement: new Element(), activeElement: trigger });
  Object.assign(document.body.style, { position: "relative", top: "3px", left: "2px", width: "90%", overflow: "auto", paddingRight: "4px" });
  Object.assign(document.documentElement, { clientWidth: 375 });
  Object.assign(document.documentElement.style, { overflow: "visible", scrollBehavior: "smooth" });
  const media = Object.assign(new EventTarget(), { matches: false });
  const window = { scrollX: 0, scrollY: 520, innerWidth: 390, matchMedia: () => media, scrollTo: (value) => scrolls.push(value) };
  Object.assign(globalThis, { document, window, HTMLElement: Element, getComputedStyle: () => ({ paddingRight: "4px" }) });
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", outputText)((name) => {
    if (name === "react") return { ...React, useRef: (value) => ({ current: refIndex++ === 0 ? dialog : value }), useEffect: (effect) => effects.push(effect), useLayoutEffect: (effect) => effects.push(effect) };
    if (name === "react-dom") return { createPortal: (node, target) => ({ node, target }) };
    return require(name);
  }, compiledModule, compiledModule.exports);
  const portal = compiledModule.exports.MobileOverlay({ label: "Site navigation", onClose: () => { closed++; }, children: "Navigation" });
  effects.forEach((effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
  const key = (key, shiftKey = false) => {
    const event = new Event("keydown", { cancelable: true });
    Object.assign(event, { key, shiftKey }); document.dispatchEvent(event); return event;
  };
  const cleanup = () => { while (cleanups.length) cleanups.pop()(); };
  return { document, first, last, trigger, portal, media, key, scrolls, get closed() { return closed; }, cleanup,
    restore() { cleanup(); globals.forEach((key, index) => {
      if (previousGlobals[index]) Object.defineProperty(globalThis, key, previousGlobals[index]); else delete globalThis[key];
    }); },
  };
}

test("mobile overlay portals outside the header and uses dynamic viewport height", () => {
  const h = harness();
  try {
    assert.equal(h.portal.target, h.document.body);
    assert.equal(h.portal.node.props.role, "dialog");
    assert.equal(h.portal.node.props["aria-modal"], "true");
    assert.match(h.portal.node.props.className, /h-dvh max-h-dvh/);
    assert.equal(h.document.activeElement, h.first);
  } finally { h.restore(); }
});

test("body scrolling is locked and original styles, scroll position and focus are restored", () => {
  const h = harness();
  try {
    assert.equal(h.document.body.style.position, "fixed");
    assert.equal(h.document.body.style.top, "-520px");
    assert.equal(h.document.documentElement.style.overflow, "hidden");
    assert.equal(h.document.body.style.paddingRight, "calc(4px + 15px)");
    h.cleanup();
    assert.equal(h.document.body.style.position, "relative");
    assert.equal(h.document.body.style.paddingRight, "4px");
    assert.equal(h.document.documentElement.style.overflow, "visible");
    assert.equal(h.document.documentElement.style.scrollBehavior, "smooth");
    assert.deepEqual(h.scrolls, [{ left: 0, top: 520, behavior: "instant" }]);
    assert.equal(h.document.activeElement, h.trigger);
  } finally { h.restore(); }
});

test("Tab and Shift+Tab keep keyboard focus inside the navigation", () => {
  const h = harness();
  try {
    assert.equal(h.key("Tab", true).defaultPrevented, true);
    assert.equal(h.document.activeElement, h.last);
    assert.equal(h.key("Tab").defaultPrevented, true);
    assert.equal(h.document.activeElement, h.first);
  } finally { h.restore(); }
});

test("Escape and switching to desktop close the overlay; listeners are cleaned up", () => {
  const h = harness();
  try {
    assert.equal(h.key("Escape").defaultPrevented, true);
    assert.equal(h.closed, 1);
    h.media.matches = true; h.media.dispatchEvent(new Event("change"));
    assert.equal(h.closed, 2);
    h.cleanup(); h.key("Escape"); h.media.dispatchEvent(new Event("change"));
    assert.equal(h.closed, 2);
  } finally { h.restore(); }
});
