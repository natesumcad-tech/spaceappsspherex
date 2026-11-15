import test from "node:test";
import assert from "node:assert/strict";
import { KeyState, normalizeNavKey, isShiftToken } from "../lib/starmap/keyState.ts";

test("KeyState activates immediately on initial press and completely ignores OS repeat events", () => {
  const keys = new KeyState();

  const first = keys.keydown({ code: "KeyW", key: "w", repeat: false });
  assert.deepEqual(first, { token: "w", added: true });
  assert.equal(keys.has("w"), true);
  assert.equal(keys.hasActiveMotion, true);

  // Repeated keydown events fired at the OS repeat delay/rate are ignored
  const rep = keys.keydown({ code: "KeyW", key: "w", repeat: true });
  assert.deepEqual(rep, { token: "w", added: false });
  assert.equal(keys.has("w"), true);

  // Releasing the key stops it immediately, and a late buffered repeat event must not re-add it
  assert.equal(keys.keyup({ code: "KeyW", key: "w" }), true);
  assert.equal(keys.has("w"), false);
  assert.equal(keys.hasActiveMotion, false);

  const lateRepeat = keys.keydown({ code: "KeyW", key: "w", repeat: true });
  assert.deepEqual(lateRepeat, { token: "w", added: false });
  assert.equal(keys.has("w"), false);
  assert.equal(keys.hasActiveMotion, false);
});

test("KeyState uses physical e.code so Shift or CapsLock changes cannot leave keys stuck", () => {
  const keys = new KeyState();

  // Hold 'w', press Shift, release uppercase 'W'
  keys.keydown({ code: "KeyW", key: "w", repeat: false });
  keys.keydown({ code: "ShiftLeft", key: "Shift", repeat: false });
  assert.equal(keys.has("w"), true);
  assert.equal(keys.shift, true);

  keys.keyup({ code: "KeyW", key: "W" });
  assert.equal(keys.has("w"), false);

  // Hold '=', while Shift is held release '+' on the same Equal physical key
  keys.keydown({ code: "Equal", key: "=", repeat: false });
  assert.equal(keys.has("="), true);
  keys.keyup({ code: "Equal", key: "+" });
  assert.equal(keys.has("="), false);

  keys.keyup({ code: "ShiftLeft", key: "Shift" });
  assert.equal(keys.size, 0);
});

test("KeyState tracks ShiftLeft and ShiftRight independently and distinguishes motion from Shift", () => {
  const keys = new KeyState();

  keys.keydown({ code: "ShiftLeft", key: "Shift", repeat: false });
  assert.equal(keys.shift, true);
  assert.equal(keys.hasActiveMotion, false);
  assert.equal(isShiftToken("shiftleft"), true);
  assert.equal(isShiftToken("w"), false);

  keys.keydown({ code: "ShiftRight", key: "Shift", repeat: false });
  keys.keyup({ code: "ShiftLeft", key: "Shift" });
  assert.equal(keys.shift, true);
  assert.equal(keys.hasActiveMotion, false);

  keys.keydown({ code: "ArrowUp", key: "ArrowUp", repeat: false });
  assert.equal(keys.has("arrowup"), true);
  assert.equal(keys.hasActiveMotion, true);

  keys.clear();
  assert.equal(keys.size, 0);
  assert.equal(keys.shift, false);
  assert.equal(keys.hasActiveMotion, false);
});

test("KeyState falls back to e.key when e.code is absent and enforces allowed-key filtering", () => {
  assert.equal(normalizeNavKey({ key: "D" }), "d");
  assert.equal(normalizeNavKey({ key: "+" }), "=");
  assert.equal(normalizeNavKey({ key: "_" }), "-");
  assert.equal(normalizeNavKey({ code: "NumpadAdd", key: "+" }), "=");
  assert.equal(normalizeNavKey({ code: "NumpadSubtract", key: "-" }), "-");

  const flyKeys = new Set(["w", "a", "s", "d", "q", "e", "shiftleft", "shiftright", "shift"]);
  const keys = new KeyState();

  assert.deepEqual(keys.keydown({ code: "KeyR", key: "r", repeat: false }, flyKeys), {
    token: null,
    added: false,
  });
  assert.deepEqual(keys.keydown({ code: "KeyG", key: "G", repeat: false }, flyKeys), {
    token: null,
    added: false,
  });
  assert.equal(keys.size, 0);

  // Synthetic event without e.code
  assert.deepEqual(keys.keydown({ key: "S", repeat: false }, flyKeys), {
    token: "s",
    added: true,
  });
  assert.equal(keys.has("s"), true);
  assert.equal(keys.keyup({ key: "s" }), true);
  assert.equal(keys.has("s"), false);
});
