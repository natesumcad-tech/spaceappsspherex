import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinateDestination, coordinateQuestion } from '../lib/assistant/coordinates.ts';
test('map x/y stays distinct from astronomical coordinates', () => {
 assert.deepEqual(coordinateDestination('Take me to x -83.2, y 24.8'), {system:'map',x:-83.2,y:24.8});
 assert.deepEqual(coordinateDestination('go to RA 83.2 Dec -24.8'), {system:'equatorial',ra:83.2,dec:-24.8});
 assert.deepEqual(coordinateDestination('269.452, +4.693'), {system:'equatorial',ra:269.452,dec:4.693});
});
test('science questions, ambiguous negative pairs and out-of-range positions do not trigger navigation', () => {
 for(const q of ['Why does x 12 y 4 change?', '-83.2, 24.8', 'go to x 200 y 15', 'go to RA 83 Dec 95']) assert.equal(coordinateDestination(q), null);
});

test('questions extract positions without triggering navigation', () => {
 assert.deepEqual(coordinateQuestion('What is at x -10.123 y 22.456?'),{system:'map',x:-10.123,y:22.456});
 assert.deepEqual(coordinateQuestion('Explain what is at RA 10.123 Dec -22.456'),{system:'equatorial',ra:10.123,dec:-22.456});
 assert.equal(coordinateDestination('What is at x -10.123 y 22.456?'),null);
 assert.equal(coordinateQuestion('Tell me about infrared light'),null);
});
