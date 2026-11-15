import test from 'node:test';
import assert from 'node:assert/strict';
import { parseResolvedPosition } from '../lib/assistant/resolve.ts';
import { coordinateDestination } from '../lib/assistant/coordinates.ts';
import { projector, unprojector } from '../lib/starmap/coords.ts';
test('verified positions preserve catalogue precision and reject missing/invalid results', () => {
 assert.deepEqual(parseResolvedPosition('<jradeg>185.72875342</jradeg><jdedeg>+15.82238891</jdedeg>'),{ra:185.72875342,dec:15.82238891});
 for (const xml of ['', '<jradeg>20</jradeg>', '<jradeg>2</jradeg><jdedeg>100</jdedeg>']) assert.equal(parseResolvedPosition(xml),null);
});
test('sexagesimal coordinates preserve seconds and negative zero declination', () => {
 const p=coordinateDestination('Take me to 17h 57m 48.5s, -00° 41\' 36"');
 assert.ok(Math.abs(p.ra-269.45208333333335)<1e-10);
 assert.ok(Math.abs(p.dec+0.6933333333333334)<1e-10);
});
test('destination positions round-trip across timeline epochs without rounding', () => {
 for(const epoch of [-14000,0,12000]) {
 const [x,y]=projector(epoch)(185.72875342,15.82238891);
 const [ra,dec]=unprojector(epoch)(x,y);
 assert.ok(Math.abs(ra-185.72875342)<1e-9);assert.ok(Math.abs(dec-15.82238891)<1e-9);
 }
});
