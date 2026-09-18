import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_AID_GUIDES, getGuides, searchGuides, getGuideContext } from './firstAidGuides.js';
import { GUIDE_LABELS } from './guideTranslations.js';

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

test('Spanish guides keep canonical identities, every step and warning, and source metadata', () => {
  const spanish = getGuides('es');
  assert.equal(spanish.length, FIRST_AID_GUIDES.length);
  for (const original of FIRST_AID_GUIDES) {
    const translated = spanish.find(guide => guide.id === original.id);
    assert.ok(translated);
    for (const field of ['title', 'summary', 'scope']) {
      assert.ok(translated[field]);
      assert.notEqual(translated[field], original[field], `${original.id}: ${field} should be localized`);
    }
    assert.equal(translated.steps.length, original.steps.length);
    assert.equal(translated.redFlags.length, original.redFlags.length);
    assert.ok(translated.steps.every((step, index) => step && step !== original.steps[index]));
    assert.ok(translated.redFlags.every((flag, index) => flag && flag !== original.redFlags[index]));
    assert.deepEqual(translated.sources.map(source => source.url), original.sources.map(source => source.url));
    assert.equal(translated.checkedAt, original.checkedAt);
    const numericFacts = guide => [guide.summary, guide.scope, ...guide.steps, ...guide.redFlags].join(' ').replace(/(\d),(\d)/gu, '$1.$2').match(/\d+(?:\.\d+)?/gu);
    assert.deepEqual(numericFacts(translated), numericFacts(original), `${original.id}: timing, ages, counts, and measurements must be preserved`);
  }
});

test('bilingual search finds canonical topics independent of the display language', () => {
  const examples = [
    ['¿Cómo limpio una herida pequeña?', 'minor-cuts'],
    ['Me quemé la mano', 'burns'],
    ['Un adulto se está atragantando', 'adult-choking'],
    ['Tengo una HEMORRAGIA', 'severe-bleeding'],
    ['¿Cómo hacer reanimación?', 'adult-cpr'],
    ['Tengo un esguince', 'sprains'],
  ];
  for (const [query, id] of examples) {
    for (const language of ['en', 'es']) assert.deepEqual(searchGuides(query, language).map(guide => guide.id), [id]);
  }
  assert.equal(searchGuides('burns', 'es')[0].title, 'Quemaduras y escaldaduras');
  assert.equal(searchGuides('quemaduras', 'en')[0].title, 'Burns and scalds');
  assert.equal(searchGuides('reanimacio\u0301n', 'es')[0].id, 'adult-cpr');
  assert.equal(searchGuides('reanimacion', 'es')[0].id, 'adult-cpr');
  for (const query of ['cortesía', '¿Cuál es el clima?', 'dolor de cabeza', 'diabetes']) {
    assert.deepEqual(searchGuides(query, 'es'), []);
    assert.equal(getGuideContext(query, 6000, 'es'), '');
  }
});

test('pediatric exclusions apply across Spanish and English regardless of display language', () => {
  const questions = [
    'Mi bebé se atraganta', 'RCP para un niño', 'RCP para una niña', 'Mi hija no respira',
    'Tiene 17 años y no responde', 'Tiene dos años y no respira', 'RCP a una persona de dieciséis años',
    'Tiene 18 meses y se atraganta', 'RCP para alguien de 24 semanas', 'A two-year-old needs CPR',
    'My baby is choking', 'RCP para un recien nacido',
  ];
  for (const query of questions) {
    for (const language of ['en', 'es']) {
      assert.deepEqual(searchGuides(query, language), [], `${language}: ${query}`);
      assert.equal(getGuideContext(query, 6000, language), '');
    }
  }
  assert.equal(searchGuides('Una persona de 18 años necesita RCP', 'es')[0].id, 'adult-cpr');
  assert.equal(searchGuides('Mi niño tiene una quemadura', 'es')[0].id, 'burns');
});

test('Spanish context keeps complete localized content and attribution inside its limit', () => {
  for (const guide of getGuides('es')) {
    const context = getGuideContext(guide.keywords[0], 6000, 'es');
    assert.ok(context.length > 0);
    for (const text of [guide.title, guide.summary, guide.scope, ...guide.steps, ...guide.redFlags, ...guide.sources.map(source => source.url), guide.checkedAt]) {
      assert.ok(context.includes(text), `${guide.id}: missing ${text}`);
    }
    assert.ok(context.includes(GUIDE_LABELS.es.contextNote));
    assert.equal(getGuideContext(guide.keywords[0], context.length, 'es'), context);
    assert.equal(getGuideContext(guide.keywords[0], context.length - 1, 'es'), '');
  }
});

test('regional language codes resolve consistently and unsupported languages fall back to English', () => {
  assert.deepEqual(getGuides('es-MX'), getGuides('es'));
  assert.deepEqual(getGuides('ES_es'), getGuides('es'));
  for (const language of ['fr', 'zz', null, undefined]) {
    assert.deepEqual(getGuides(language), FIRST_AID_GUIDES);
  }
  assert.deepEqual(Object.keys(GUIDE_LABELS.es).sort(), Object.keys(GUIDE_LABELS.en).sort());
});
