// Pure circuit validator, independent of the AR renderer.
// Each wire connects two named terminals; the physical wire color does not matter.
const neededPairs = [
  ['batteryPlus', 'switchIn'],
  ['switchOut', 'lampPlus'],
  ['lampMinus', 'batteryMinus'],
];
const signature = (a, b) => [a, b].sort().join(':');
const needed = new Set(neededPairs.map(([a, b]) => signature(a, b)));
const terminals = new Set(neededPairs.flat());

// A free end has port:null. Malformed state must never make the lamp light,
// and must not interrupt the render loop with an exception.
export function assessCircuit(wires, switchClosed) {
  if (!Array.isArray(wires)) return {correctCount: 0, connected: false, lit: false};

  const pairs = [];
  const occupied = new Set();
  let valid = wires.length === neededPairs.length;
  for (const wire of wires) {
    if (!Array.isArray(wire?.ends) || wire.ends.length !== 2) {
      valid = false;
      continue;
    }
    const [a, b] = wire.ends.map(end => end?.port);
    if (!terminals.has(a) || !terminals.has(b) || a === b) {
      valid = false;
      continue;
    }
    for (const port of [a, b]) {
      if (occupied.has(port)) valid = false;
      occupied.add(port);
    }
    pairs.push(signature(a, b));
  }
  const unique = new Set(pairs);
  const correctCount = [...unique].filter(pair => needed.has(pair)).length;
  const connected = valid && correctCount === neededPairs.length;
  return {correctCount, connected, lit: connected && switchClosed === true};
}
export const requiredConnections = neededPairs.map(p => [...p]);
