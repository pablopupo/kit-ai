import { GUIDE_TRANSLATIONS, GUIDE_LABELS, resolveGuideLanguage } from './guideTranslations.js';

// Concise paraphrases checked against the linked public guidance, not clinician review.
// Keep each source-backed guide complete when passing it to the assistant.
const CHECKED_AT = '2026-09-18';

export const FIRST_AID_GUIDES = [
  {
    id: 'minor-cuts',
    title: 'Minor cuts and grazes',
    summary: 'Control bleeding, rinse a small wound, then protect it with a clean dressing.',
    keywords: ['cut', 'cuts', 'graze', 'grazes', 'scrape', 'scrapes', 'scraped', 'small wound', 'minor wound'],
    scope: 'Small, superficial skin wounds. Deep wounds, embedded objects and uncontrolled bleeding need medical care.',
    steps: [
      'Wash and dry your hands; use disposable gloves if available.',
      'Press a clean folded cloth or dressing firmly on bleeding skin. If an object is embedded, leave it in place and press around it.',
      'Once bleeding has stopped, rinse a small wound with clean tap or bottled water. Clean the surrounding skin with soap and water.',
      'Gently dry and cover with a sterile dressing. Keep it clean and dry; replace it when needed.',
    ],
    redFlags: [
      'Get emergency help for uncontrolled or spurting bleeding, a deep wound, an embedded object, numbness or difficulty moving.',
      'Get prompt medical advice for bites, persistent dirt, increasing redness, swelling, pain, pus or fever.',
    ],
    sources: [{ title: 'NHS: Cuts and grazes', url: 'https://www.nhs.uk/conditions/cuts-and-grazes/' }],
    checkedAt: CHECKED_AT,
  },
  {
    id: 'burns',
    title: 'Burns and scalds',
    summary: 'Cool a heat burn promptly with cool running water for 20 minutes.',
    keywords: ['burn', 'burns', 'burned', 'burnt', 'scald', 'scalds', 'scalded'],
    scope: 'Immediate care for heat burns. Chemical and electrical burns need emergency care; seek medical advice for children under 5.',
    steps: [
      'Cool the affected skin under cool running water for 20 minutes as soon as possible, within 3 hours of the injury.',
      'Remove nearby clothing and jewellery unless stuck to the skin.',
      'After cooling, loosely lay clean cling film over the burn. Do not wrap it around a limb.',
      'Do not apply butter, oils or creams, use sticky dressings, or burst blisters.',
    ],
    redFlags: [
      'Get emergency care for a large or deep burn, burns to the face, genitals or buttocks, or any chemical or electrical burn.',
      'Seek urgent medical advice if the person is under 5 or you are unsure how serious the burn is.',
    ],
    sources: [{ title: 'NHS: Burns and scalds', url: 'https://www.nhs.uk/conditions/burns-and-scalds/' }],
    checkedAt: CHECKED_AT,
  },
  {
    id: 'adult-choking',
    title: 'Adult choking',
    summary: 'Act immediately when a choking adult cannot cough, speak or breathe effectively.',
    keywords: ['choke', 'chokes', 'choked', 'choking', 'heimlich', 'food stuck', 'blocked airway'],
    scope: 'Adults only. Children and infants need age-appropriate instructions. Follow the emergency dispatcher.',
    steps: [
      'If they can cough effectively, encourage coughing and stay with them.',
      'For an ineffective cough or inability to speak or breathe, have someone call the local emergency number now.',
      'Support their chest, lean them forward and give up to 5 separate blows between the shoulder blades with your hand heel.',
      'If still choking, stand behind them. Put a fist just above the navel, grasp it, and give up to 5 inward-and-upward abdominal thrusts. Use chest thrusts instead during pregnancy or if you cannot reach around them.',
      'Alternate these sets until the blockage clears or they become unresponsive. If unresponsive, lower them onto a firm, flat surface and start CPR, beginning with compressions, following dispatcher instructions. Never sweep the mouth blindly.',
    ],
    redFlags: ['Weak or absent coughing, inability to speak, blue or pale skin, or unresponsiveness require emergency help.'],
    sources: [{ title: 'American Red Cross: Choking', url: 'https://www.redcross.org/take-a-class/resources/learn-first-aid/adult-child-choking' }],
    checkedAt: CHECKED_AT,
  },
  {
    id: 'severe-bleeding',
    title: 'Severe bleeding',
    summary: 'Call for emergency help and apply firm, continuous pressure to visible severe bleeding.',
    keywords: ['bleeding', 'bleed', 'bleeds', 'hemorrhage', 'haemorrhage', 'blood loss', 'spurting blood'],
    scope: 'External bleeding. Children can lose a dangerous amount of blood more quickly; do not wait to estimate blood volume.',
    steps: [
      'Make sure the scene is safe. Call the local emergency number or ask someone else to call. Use gloves or a barrier if available.',
      'Place a dressing or clean cloth directly on the wound and press firmly and steadily. Continue until bleeding stops, someone takes over or a tourniquet controls the bleeding.',
      'Leave embedded objects in place and press around them.',
      'For life-threatening limb bleeding, use a tourniquet if available and you are trained. Follow the emergency dispatcher; wound packing also requires training.',
      'Stay with the person, prevent chilling, and watch breathing and responsiveness until help takes over.',
    ],
    redFlags: ['Continuous heavy flow, spurting blood, or signs of shock such as pale, cold, moist skin or reduced responsiveness are emergencies.'],
    sources: [{ title: 'American Red Cross: Life-threatening bleeding', url: 'https://www.redcross.org/take-a-class/resources/learn-first-aid/bleeding-life-threatening-external' }],
    checkedAt: CHECKED_AT,
  },
  {
    id: 'adult-cpr',
    title: 'Adult hands-only CPR',
    summary: 'For an adult who suddenly collapses, is unresponsive and is not breathing normally: call, compress, use an AED.',
    keywords: ['cpr', 'cardiac arrest', 'chest compressions', 'resuscitation', 'not breathing', 'stopped breathing', 'unresponsive', 'collapsed'],
    scope: 'Adult sudden collapse. This guide does not cover infant/child CPR, drowning or overdose; those may need breaths. Follow the emergency dispatcher.',
    steps: [
      'Check scene safety. Tap their shoulders and shout to check responsiveness. Gasping is not normal breathing.',
      'Call the local emergency number immediately. Ask someone to bring an AED (automated external defibrillator). Follow dispatcher instructions.',
      'If unresponsive and not breathing normally, push hard and fast in the centre of the chest: 100–120 compressions per minute, at least 2 inches (5 cm) deep, avoiding depths over 2.4 inches (6 cm). Let the chest rise fully after each push.',
      'Switch on the AED as soon as it arrives and follow its spoken instructions.',
      'Continue until normal breathing or movement returns, or trained responders take over.',
    ],
    redFlags: ['Unresponsiveness with absent or abnormal breathing is an emergency. Do not wait for an AI response.'],
    sources: [
      { title: 'American Heart Association: Cardiac arrest treatment', url: 'https://www.heart.org/en/health-topics/cardiac-arrest/emergency-treatment-of-cardiac-arrest' },
      { title: 'American Heart Association: Adult basic life support', url: 'https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines/adult-basic-life-support' },
      { title: 'American Heart Association: Hands-only CPR and CPR with breaths', url: 'https://cpr.heart.org/-/media/CPR-Files/Courses-and-Kits/Hands-Only-CPR/2024-HOCPR-Resources/DS17758_CPRWeek_HOCPRvsCPR_2024_052124.pdf?sc_lang=en' },
    ],
    checkedAt: CHECKED_AT,
  },
  {
    id: 'sprains',
    title: 'Sprains and strains',
    summary: 'Protect and rest the injury initially, use wrapped cold packs, and seek help for signs of a fracture.',
    keywords: ['sprain', 'sprains', 'sprained', 'strain', 'strains', 'strained', 'twisted ankle', 'rolled ankle', 'pulled muscle'],
    scope: 'Initial care for suspected muscle or ligament injuries. A guide cannot rule out a fracture.',
    steps: [
      'For the first 2–3 days, protect the injury, stop exercise and avoid putting weight on it.',
      'Apply a cold pack wrapped in a towel for up to 20 minutes every 2–3 hours.',
      'Use a supporting bandage during the day and raise the injured area on pillows.',
      'Avoid heat, alcohol and massage initially. Begin gentle movement when pain no longer stops you.',
    ],
    redFlags: [
      'Get emergency assessment for a crack at injury, a changed shape, numbness, tingling, or cold, blue or grey skin.',
      'Get prompt medical advice for severe or worsening pain or swelling, inability to walk a few steps, fever, or failure to improve.',
    ],
    sources: [{ title: 'NHS: Sprains and strains', url: 'https://www.nhs.uk/conditions/sprains-and-strains/' }],
    checkedAt: CHECKED_AT,
  },
];

function normalize(value) {
  return typeof value === 'string'
    ? value.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    : '';
}

function includesPhrase(query, phrase) {
  return ` ${query} `.includes(` ${normalize(phrase)} `);
}

const CHILD_TERMS = [
  'baby', 'babies', 'infant', 'infants', 'newborn', 'toddler', 'toddlers', 'child', 'children', 'kid', 'kids', 'pediatric', 'paediatric',
  'bebe', 'bebes', 'nino', 'nina', 'ninos', 'ninas', 'infante', 'infantes', 'lactante', 'lactantes', 'recien nacido', 'recien nacida', 'menor', 'menores', 'pediatrico', 'pediatrica', 'hijo', 'hija', 'hijos', 'hijas',
];
const ADULT_ONLY_IDS = new Set(['adult-choking', 'adult-cpr']);
const ENGLISH_CHILD_AGES = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen) years? old\b/u;
const SPANISH_CHILD_AGES = /\b(?:cero|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete) anos?\b/u;

/** Same canonical IDs and source metadata in every supported display language. */
export function getGuides(language = 'en') {
  const translations = GUIDE_TRANSLATIONS[resolveGuideLanguage(language)];
  if (!translations) return FIRST_AID_GUIDES;
  return FIRST_AID_GUIDES.map(guide => {
    const translation = translations[guide.id];
    if (!translation) return guide;
    const { sourceTitles, ...content } = translation;
    return {
      ...guide,
      ...content,
      sources: guide.sources.map((source, index) => ({ ...source, title: sourceTitles[index] || source.title })),
    };
  });
}

// Search all supported languages regardless of the selected display language.
// Deduplication prevents shared words from receiving an accidental ranking boost.
const SEARCH_KEYWORDS = new Map(FIRST_AID_GUIDES.map(guide => [guide.id, [...new Set([
  ...guide.keywords,
  ...Object.values(GUIDE_TRANSLATIONS).flatMap(translations => translations[guide.id]?.keywords || []),
].map(normalize))]]));

/** Returns only topic matches, ordered by specificity; an empty query returns []. */
export function searchGuides(query, language = 'en') {
  const normalized = normalize(query);
  if (!normalized) return [];
  const isChildQuery = CHILD_TERMS.some(term => includesPhrase(normalized, term))
    || /\b(?:[0-9]|1[0-7]) (?:year|years|yr|yrs) old\b/u.test(normalized)
    || /\b\d+ (?:month|months|week|weeks) old\b/u.test(normalized)
    || /\b(?:[0-9]|1[0-7]) anos?\b/u.test(normalized)
    || /\b\d+ (?:mes|meses|semanas?)\b/u.test(normalized)
    || ENGLISH_CHILD_AGES.test(normalized)
    || SPANISH_CHILD_AGES.test(normalized);

  return getGuides(language)
    .filter(guide => !(isChildQuery && ADULT_ONLY_IDS.has(guide.id)))
    .map(guide => ({
      guide,
      score: SEARCH_KEYWORDS.get(guide.id).reduce((score, keyword) => (
        includesPhrase(normalized, keyword) ? score + normalize(keyword).split(' ').length : score
      ), 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ guide }) => guide);
}

function formatGuide(guide, language) {
  const labels = GUIDE_LABELS[resolveGuideLanguage(language)];
  return [
    `${labels.guide}: ${guide.title}`,
    `${labels.scope}: ${guide.scope}`,
    guide.summary,
    `${labels.contextHelp}: ${guide.redFlags.join(' ')}`,
    ...guide.steps.map((step, index) => `${index + 1}. ${step}`),
    `${labels.sources}: ${guide.sources.map(source => `${source.title} (${source.url})`).join('; ')}`,
    `${labels.checked}: ${guide.checkedAt}. ${labels.contextNote}`,
  ].join('\n');
}

/** Whole guides only: never truncate steps, escalation advice, or attribution. */
export function getGuideContext(query, maxChars = 6000, language = 'en') {
  if (!Number.isFinite(maxChars) || maxChars < 1) return '';
  const limit = Math.floor(maxChars);
  let context = '';
  for (const guide of searchGuides(query, language)) {
    const next = `${context ? '\n\n' : ''}${formatGuide(guide, language)}`;
    if (context.length + next.length > limit) break;
    context += next;
  }
  return context;
}
