import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseSurfaceHit} from '../placement.js';

const surface = (overrides = {}) => ({
  type: 'DETECTED_SURFACE',
  distance: 1,
  position: {x: 0, y: 0, z: -1},
  ...overrides,
});

test('both engine horizontal-surface hit types are usable', () => {
  for (const type of ['DETECTED_SURFACE', 'ESTIMATED_SURFACE']) {
    const hit = surface({type});
    assert.equal(chooseSurfaceHit([hit]), hit);
  }
});

test('feature points and fabricated camera poses cannot place the board', () => {
  for (const type of ['FEATURE_POINT', 'UNSPECIFIED', 'NORMAL', '', undefined, null]) {
    assert.equal(chooseSurfaceHit([surface({type})]), null);
  }
  assert.equal(chooseSurfaceHit([{position: {x: 0, y: 0, z: -1}, distance: 1}]), null);
});

test('null, malformed and empty hit results are safely rejected', () => {
  for (const hits of [null, undefined, {}, 'hits', 42, [], [null], [undefined], [{}]]) {
    assert.equal(chooseSurfaceHit(hits), null);
  }
});

test('all three position coordinates must be finite numbers', () => {
  for (const axis of ['x', 'y', 'z']) {
    for (const value of [NaN, Infinity, -Infinity, undefined, null, '0']) {
      assert.equal(chooseSurfaceHit([surface({position: {x: 0, y: 0, z: -1, [axis]: value}})]), null);
    }
  }
  for (const position of [null, undefined, {}, []]) {
    assert.equal(chooseSurfaceHit([surface({position})]), null);
  }
});

test('hits behind the camera, too close or too far do not qualify', () => {
  for (const distance of [-1, 0, 0.249, 4.001, NaN, Infinity, -Infinity, undefined, null, '1']) {
    assert.equal(chooseSurfaceHit([surface({distance})]), null);
  }
});

test('the documented 25 cm and 4 m distance boundaries are accepted', () => {
  for (const distance of [0.25, 4]) {
    const hit = surface({distance});
    assert.equal(chooseSurfaceHit([hit]), hit);
  }
});

test('selects the nearest valid surface without changing engine results', () => {
  const nearest = surface({distance: 0.7, position: {x: -0.1, y: 0.4, z: -0.5}});
  const hits = [surface({distance: 3}), surface({type: 'FEATURE_POINT', distance: 0.3}),
    nearest, surface({type: 'ESTIMATED_SURFACE', distance: 1.5})];
  const snapshot = structuredClone(hits);
  assert.equal(chooseSurfaceHit(hits), nearest);
  assert.deepEqual(hits, snapshot);
});

test('invalid closer hits do not hide a usable surface', () => {
  const usable = surface({distance: 1.1});
  assert.equal(chooseSurfaceHit([surface({position: {x: NaN, y: 0, z: 0}, distance: 0.4}), null, usable]), usable);
});
