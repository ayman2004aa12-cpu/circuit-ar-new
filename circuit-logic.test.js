import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCircuit, requiredConnections} from '../circuit-logic.js';

const wire = (a, b) => ({ends: [{port: a}, {port: b}]});
const complete = () => [
  wire('batteryPlus', 'switchIn'),
  wire('switchOut', 'lampPlus'),
  wire('lampMinus', 'batteryMinus'),
];
const unlit = {correctCount: 0, connected: false, lit: false};

test('required connections describe the positive-to-switch-to-lamp-to-negative path', () => {
  assert.deepEqual(requiredConnections, [
    ['batteryPlus', 'switchIn'],
    ['switchOut', 'lampPlus'],
    ['lampMinus', 'batteryMinus'],
  ]);
});

test('the lamp follows the switch only when all three connections are complete', () => {
  assert.deepEqual(assessCircuit(complete(), false), {correctCount: 3, connected: true, lit: false});
  assert.deepEqual(assessCircuit(complete(), true), {correctCount: 3, connected: true, lit: true});
  for (const value of [undefined, null, 'closed', 1, {}, []]) {
    assert.equal(assessCircuit(complete(), value).lit, false);
  }
});

test('wire order, color and endpoint direction do not change conductivity', () => {
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const order of orders) {
    for (let reversals = 0; reversals < 8; reversals++) {
      const wires = order.map((index, position) => {
        const item = complete()[index];
        if (reversals & (1 << position)) item.ends.reverse();
        item.color = ['yellow', 'red', 'cyan'][position];
        return item;
      });
      assert.equal(assessCircuit(wires, true).lit, true);
    }
  }
});

test('disconnecting any of the six ends immediately opens the circuit; reconnecting restores it', () => {
  for (let index = 0; index < 3; index++) {
    for (let end = 0; end < 2; end++) {
      const wires = complete();
      const previous = wires[index].ends[end].port;
      wires[index].ends[end].port = null;
      assert.deepEqual(assessCircuit(wires, true), {correctCount: 2, connected: false, lit: false});
      wires[index].ends[end].port = previous;
      assert.equal(assessCircuit(wires, true).lit, true);
    }
  }
});

test('three fully attached but incorrect wires cannot bypass the switch or lamp', () => {
  const cases = [
    [wire('batteryPlus', 'batteryMinus'), wire('switchIn', 'switchOut'), wire('lampPlus', 'lampMinus')],
    [wire('batteryPlus', 'lampPlus'), wire('switchIn', 'switchOut'), wire('lampMinus', 'batteryMinus')],
    [wire('batteryPlus', 'switchIn'), wire('switchOut', 'lampMinus'), wire('lampPlus', 'batteryMinus')],
  ];
  for (const wires of cases) assert.equal(assessCircuit(wires, true).lit, false);
});

test('a repeated correct pair contributes only one point and cannot complete a circuit', () => {
  const wires = [wire('batteryPlus', 'switchIn'), wire('switchIn', 'batteryPlus'), wire('switchOut', 'lampPlus')];
  assert.deepEqual(assessCircuit(wires, true), {correctCount: 2, connected: false, lit: false});
});

test('shorting an end to itself and sharing a terminal both leave the lamp off', () => {
  const shorted = complete();
  shorted[2] = wire('batteryMinus', 'batteryMinus');
  assert.equal(assessCircuit(shorted, true).lit, false);
  const shared = complete();
  shared[2] = wire('batteryMinus', 'switchIn');
  assert.equal(assessCircuit(shared, true).lit, false);
});

test('missing wires and extra wires do not constitute the required three-wire experiment', () => {
  assert.equal(assessCircuit(complete().slice(0, 2), true).connected, false);
  assert.equal(assessCircuit([...complete(), wire(null, null)], true).connected, false);
  assert.equal(assessCircuit([...complete(), wire('batteryPlus', 'batteryMinus')], true).connected, false);
});

test('unknown terminal identifiers are not electrical ports', () => {
  const wires = complete();
  wires[0] = wire('batteryPlus', 'unknown');
  assert.deepEqual(assessCircuit(wires, true), {correctCount: 2, connected: false, lit: false});
});

test('malformed imported or reset state never throws and never lights the lamp', () => {
  for (const input of [null, undefined, {}, 'wires', 1, [], [null], [undefined], [{}],
    [{ends: []}], [{ends: [null, null]}], [{ends: [{port: 'batteryPlus'}]}],
    [{ends: [{port: 'batteryPlus'}, {port: 'switchIn'}, {port: 'lampPlus'}]}],
    [{ends: 'batteryPlus:switchIn'}]]) {
    assert.deepEqual(assessCircuit(input, true), unlit);
  }
});

test('assessment does not mutate the wire state', () => {
  const wires = complete();
  const before = structuredClone(wires);
  assessCircuit(wires, true);
  assert.deepEqual(wires, before);
});
