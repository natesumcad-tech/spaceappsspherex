import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRaDec } from '../lib/starmap/coordSearch.ts';

const close = (r, ra, dec) => {
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(Math.abs(r.coord.ra - ra) < 1e-6 && Math.abs(r.coord.dec - dec) < 1e-6, JSON.stringify(r.coord));
};

test('full sexagesimal and decimal input still work', () => {
  close(parseRaDec(`17h 57m 48.5s +04° 41' 36"`), 269.4520833, 4.6933333);
  close(parseRaDec('269.452, +4.693'), 269.452, 4.693);
  close(parseRaDec('68 26'), 68, 26);
});

test('short sexagesimal with an h is accepted', () => {
  close(parseRaDec('4h32m +26'), 68, 26);
  close(parseRaDec('4h 32m +26°'), 68, 26);
  close(parseRaDec('4h32m, +26° 30\''), 68, 26.5);
  close(parseRaDec(`5h55m10s +7°24'25"`), (5 + 55 / 60 + 10 / 3600) * 15, 7 + 24 / 60 + 25 / 3600);
  close(parseRaDec('17h45m -29°'), 266.25, -29);
  close(parseRaDec('6h −30'), 90, -30);
});

test('bad short input is rejected', () => {
  assert.equal(parseRaDec('25h +10').ok, false);
  assert.equal(parseRaDec('4h70m +10').ok, false);
  assert.equal(parseRaDec('4h +95').ok, false);
});
