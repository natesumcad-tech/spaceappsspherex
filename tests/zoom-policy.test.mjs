import test from "node:test";
import assert from "node:assert/strict";
import { ZoomExitGesture, wheelPixels, discardDetailedTile } from "../lib/explorer/zoom-policy.ts";

test("ordinary zoom-out and one large wheel event cannot close the view", () => {
  const gesture = new ZoomExitGesture();
  assert.equal(gesture.update(160, false, 0), false);
  assert.equal(gesture.update(1000, true, 10), false);
  assert.equal(gesture.update(60, true, 30), true);
});
test("continued outward scroll exits once; re-entry resets the gesture", () => {
  const gesture = new ZoomExitGesture();
  assert.equal(gesture.update(120, true, 0), false);
  assert.equal(gesture.update(120, true, 20), true);
  assert.equal(gesture.update(120, true, 40), false);
  gesture.reset();
  assert.equal(gesture.update(120, true, 60), false);
  assert.equal(gesture.update(120, true, 80), true);
});
test("zooming in, moving off the boundary, or pausing cancels exit intent", () => {
  for (const middle of [[-10, true, 20], [10, false, 20], [10, true, 700]]) {
    const gesture = new ZoomExitGesture();
    gesture.update(150, true, 0);
    assert.equal(gesture.update(...middle), false);
    assert.equal(gesture.update(80, true, middle[2] + 20), false);
  }
});
test("wheel pixels, lines, pages and extreme trackpad deltas are normalized", () => {
  assert.equal(wheelPixels(40, 0, 900), 40);
  assert.equal(wheelPixels(3, 1, 900), 48);
  assert.equal(wheelPixels(1, 2, 900), 160);
  assert.equal(wheelPixels(-1000, 0, 900), -160);
});
test("zooming out drops distant-detail textures but retains visible and neighboring levels", () => {
  assert.equal(discardDetailedTile(8, 2, false), true);
  assert.equal(discardDetailedTile(3, 2, false), false);
  assert.equal(discardDetailedTile(0, 2, false), false);
  assert.equal(discardDetailedTile(8, 2, true), false);
  assert.equal(discardDetailedTile(8, 8, false), false);
});
