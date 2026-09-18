import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_AID_GUIDES, searchGuides, getGuideContext } from './firstAidGuides.js';

test('unrelated and empty queries never receive unrelated first aid context', () => {
  for (const query of ['', '  ', null, undefined, {}, 'What is the weather?', 'I have a headache', 'How do I treat diabetes?']) {
    assert.deepEqual(searchGuides(query), []);
    assert.equal(getGuideContext(query), '');
  }
});

test('matches topics with case, punctuation, and phrase boundaries', () => {
  assert.deepEqual(searchGuides('I BURNED my hand!').map(guide => guide.id), ['burns']);
  assert.deepEqual(searchGuides('I have a rolled-ankle.').map(guide => guide.id), ['sprains']);
  assert.deepEqual(searchGuides('small cut and a scald').map(guide => guide.id), ['minor-cuts', 'burns']);
  assert.deepEqual(searchGuides('haircut shortcut heartburn restrained'), []);
});

test('does not offer adult CPR or choking instructions for an explicitly pediatric query', () => {
  for (const query of ['My baby is choking', 'CPR for children', 'my 8-year-old stopped breathing', 'CPR for a 6-month-old', 'my 18-month-old is choking', 'CPR for a 24-week-old']) {
    assert.deepEqual(searchGuides(query), []);
  }
  assert.equal(searchGuides('An adult is choking')[0].id, 'adult-choking');
});

test('context retains all safety guidance and sources without exceeding its bound', () => {
  const context = getGuideContext('burn');
  const guide = FIRST_AID_GUIDES.find(item => item.id === 'burns');
  assert.ok(context.length > 0);
  for (const detail of [guide.scope, ...guide.redFlags, ...guide.steps, guide.sources[0].url, guide.checkedAt]) {
    assert.ok(context.includes(detail), `Missing guide detail: ${detail}`);
  }
  assert.equal(getGuideContext('burn', context.length), context);
  assert.equal(getGuideContext('burn', context.length - 1), '');
  assert.equal(getGuideContext('burn and sprain', context.length), context);
  for (const limit of [0, -1, 1, NaN, Infinity]) assert.equal(getGuideContext('burn', limit), '');
});

test('every offline guide has a unique id, scope, escalation, and primary source', () => {
  assert.equal(FIRST_AID_GUIDES.length, 6);
  assert.equal(new Set(FIRST_AID_GUIDES.map(guide => guide.id)).size, 6);
  for (const guide of FIRST_AID_GUIDES) {
    assert.ok(guide.scope && guide.steps.length && guide.redFlags.length);
    assert.match(guide.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
    for (const source of guide.sources) {
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:');
      assert.ok(['www.nhs.uk', 'www.redcross.org', 'www.heart.org', 'cpr.heart.org'].includes(url.hostname));
    }
  }
});
