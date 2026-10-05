import test from 'node:test';
import assert from 'node:assert/strict';
import { Icon } from '../public/js/ui/icons.js';

test('interface icons come from the same Nucleo Sharp family', () => {
  for (const [name, markup] of Object.entries(Icon)) {
    assert.match(markup, /class="nucleo-sharp /, `${name} should use the shared icon set`);
    assert.match(markup, /aria-hidden="true"/, `${name} should stay decorative`);
  }
  assert.match(Icon.ledger, /nucleo-BookBookmark/);
  assert.match(Icon.people, /nucleo-Users2/);
});

test('sharing, sending, reminders, memories and alerts have distinct semantic icons', () => {
  const actions = ['share', 'send', 'copy', 'nudge', 'bell', 'moment', 'heart', 'edit'];
  assert.equal(new Set(actions.map(name => Icon[name])).size, actions.length);
  for (const name of actions) assert.ok(Icon[name], `${name} is present`);
});
