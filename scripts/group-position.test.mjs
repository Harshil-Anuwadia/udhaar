import assert from 'node:assert/strict';
import { groupPosition } from '../public/js/core/group-position.js';

assert.deepEqual(groupPosition([{ owes: 250, isOwed: 0 }]), {
  incoming: 250,
  outgoing: 0,
  state: 'incoming',
});

assert.deepEqual(groupPosition([{ owes: 0, isOwed: 180 }]), {
  incoming: 0,
  outgoing: 180,
  state: 'outgoing',
});

assert.deepEqual(groupPosition([{ owes: 250, isOwed: 0 }, { owes: 0, isOwed: 180 }]), {
  incoming: 250,
  outgoing: 180,
  state: 'both',
});

assert.deepEqual(groupPosition([{ owes: 0, isOwed: 0 }]), {
  incoming: 0,
  outgoing: 0,
  state: 'settled',
});

console.log('Group position labels passed.');
