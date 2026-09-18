// Translations of the English summaries in firstAidGuides.js.
// They preserve the same source material; they have not been clinically reviewed.
export const GUIDE_TRANSLATIONS = {
  es: {
    'minor-cuts': {
      title: 'Cortes y raspaduras leves',
      summary: 'Detenga el sangrado, enjuague la herida pequeña y protéjala con un apósito limpio.',
      scope: 'Heridas pequeñas y superficiales de la piel. Las heridas profundas, los objetos incrustados y el sangrado que no se controla necesitan atención médica.',
      keywords: ['corte', 'cortes', 'cortado', 'cortada', 'raspadura', 'raspaduras', 'raspon', 'raspones', 'raspado', 'raspada', 'raspe', 'herida pequena', 'herida leve'],
      steps: [
        'Lávese y séquese las manos; use guantes desechables si dispone de ellos.',
        'Presione firmemente la zona que sangra con una tela limpia doblada o un apósito. Si hay un objeto incrustado, déjelo en su sitio y presione alrededor.',
        'Cuando deje de sangrar, enjuague la herida pequeña con agua limpia del grifo o embotellada. Limpie la piel de alrededor con agua y jabón.',
        'Seque con suavidad y cubra con un apósito estéril. Manténgalo limpio y seco; cámbielo cuando sea necesario.',
      ],
      redFlags: [
        'Busque ayuda de emergencia si el sangrado no se controla o sale a chorros, la herida es profunda, hay un objeto incrustado, entumecimiento o dificultad para mover la zona.',
        'Consulte pronto a un profesional por mordeduras, suciedad que no sale, enrojecimiento, hinchazón o dolor que aumentan, pus o fiebre.',
      ],
      sourceTitles: ['NHS: Cortes y raspaduras'],
    },
    burns: {
      title: 'Quemaduras y escaldaduras',
      summary: 'Enfríe cuanto antes una quemadura por calor con agua corriente fresca durante 20 minutos.',
      scope: 'Atención inmediata de quemaduras por calor. Las quemaduras químicas o eléctricas necesitan atención de emergencia; consulte a un profesional si el menor tiene menos de 5 años.',
      keywords: ['quemadura', 'quemaduras', 'quemado', 'quemada', 'queme', 'escaldadura', 'escaldaduras', 'escaldado', 'escaldada'],
      steps: [
        'Enfríe la piel afectada con agua corriente fresca durante 20 minutos lo antes posible, dentro de las 3 horas siguientes a la lesión.',
        'Retire la ropa y las joyas cercanas, salvo que estén pegadas a la piel.',
        'Después de enfriar, coloque film transparente limpio sin apretarlo sobre la quemadura. No lo enrolle alrededor de una extremidad.',
        'No use hielo, mantequilla, aceites ni cremas; no use apósitos adhesivos ni reviente las ampollas.',
      ],
      redFlags: [
        'Busque atención de emergencia si la quemadura es grande o profunda, afecta la cara, los genitales o los glúteos, o se debe a productos químicos o electricidad.',
        'Consulte con urgencia si la persona tiene menos de 5 años o no sabe qué tan grave es la quemadura.',
      ],
      sourceTitles: ['NHS: Quemaduras y escaldaduras', 'Cruz Roja Americana: Quemaduras'],
    },
    'adult-choking': {
      title: 'Atragantamiento en adultos',
      summary: 'Actúe de inmediato si un adulto que se atraganta no puede toser, hablar o respirar de forma eficaz.',
      scope: 'Solo para adultos. Los niños y bebés necesitan instrucciones apropiadas para su edad. Siga las indicaciones del operador de emergencias.',
      keywords: ['atragantamiento', 'atragantamientos', 'atraganta', 'atragantado', 'atragantada', 'atragantando', 'ahogando con comida', 'comida atascada', 'via aerea obstruida'],
      steps: [
        'Si puede toser de forma eficaz, anímelo a seguir tosiendo y permanezca a su lado.',
        'Si la tos no es eficaz o no puede hablar o respirar, pida a alguien que llame ahora al número local de emergencias.',
        'Sostenga su pecho, inclínelo hacia delante y dé hasta 5 golpes separados entre los omóplatos con la base de la palma de la mano.',
        'Si sigue atragantado, colóquese detrás. Ponga un puño justo por encima del ombligo, sujételo y dé hasta 5 compresiones abdominales hacia dentro y arriba. Use compresiones torácicas si la persona está embarazada o no puede rodearla con los brazos.',
        'Alterne estas series hasta que se libere la obstrucción o deje de responder. Si deja de responder, bájelo a una superficie firme y plana e inicie RCP, empezando por compresiones, siguiendo al operador de emergencias. Nunca introduzca los dedos a ciegas en la boca.',
      ],
      redFlags: ['La tos débil o ausente, no poder hablar, la piel azulada o pálida, o no responder requieren ayuda de emergencia.'],
      sourceTitles: ['Cruz Roja Americana: Atragantamiento'],
    },
    'severe-bleeding': {
      title: 'Sangrado abundante',
      summary: 'Llame a emergencias y aplique presión firme y continua sobre un sangrado abundante visible.',
      scope: 'Sangrado externo. Los niños pueden perder una cantidad peligrosa de sangre más rápidamente; no espere a calcular cuánto han perdido.',
      keywords: ['sangrado', 'sangra', 'sangrando', 'hemorragia', 'hemorragias', 'perdida de sangre', 'sangre a chorros'],
      steps: [
        'Compruebe que el lugar sea seguro. Llame al número local de emergencias o pida a alguien que llame. Use guantes o una barrera si dispone de ellos.',
        'Coloque un apósito o una tela limpia directamente sobre la herida y presione con firmeza y sin interrupción. Continúe hasta que deje de sangrar, otra persona lo releve o un torniquete controle el sangrado.',
        'Deje los objetos incrustados en su sitio y presione alrededor.',
        'Si el sangrado de una extremidad pone en peligro la vida, use un torniquete si dispone de él y está capacitado. Siga al operador de emergencias; el taponamiento de heridas también requiere capacitación.',
        'Permanezca con la persona, evite que se enfríe y vigile su respiración y respuesta hasta que llegue ayuda y se haga cargo.',
      ],
      redFlags: ['El flujo abundante y continuo, la sangre a chorros o signos de choque, como piel pálida, fría y húmeda o menor respuesta, son emergencias.'],
      sourceTitles: ['Cruz Roja Americana: Sangrado potencialmente mortal'],
    },
    'adult-cpr': {
      title: 'RCP solo con las manos en adultos',
      summary: 'Si un adulto se desploma de repente, no responde y no respira normalmente: llame, haga compresiones y use un DEA.',
      scope: 'Colapso repentino en adultos. Esta guía no cubre RCP en bebés o niños, ahogamiento ni sobredosis; pueden necesitar ventilaciones. Siga al operador de emergencias.',
      keywords: ['rcp', 'paro cardiaco', 'parada cardiaca', 'compresiones toracicas', 'reanimacion', 'no respira', 'dejo de respirar', 'no responde', 'se desplomo'],
      steps: [
        'Compruebe que el lugar sea seguro. Dé golpecitos en los hombros y háblele en voz alta para ver si responde. Jadear no es respirar normalmente.',
        'Llame de inmediato al número local de emergencias. Pida a alguien que traiga un DEA (desfibrilador externo automático). Siga las indicaciones del operador.',
        'Si no responde ni respira normalmente, presione fuerte y rápido en el centro del pecho: 100–120 compresiones por minuto, al menos 2 pulgadas (5 cm) de profundidad, sin superar 2,4 pulgadas (6 cm). Deje que el pecho se eleve completamente entre compresiones.',
        'Encienda el DEA en cuanto llegue y siga sus instrucciones de voz.',
        'Continúe hasta que vuelva la respiración normal o el movimiento, o hasta que personal capacitado se haga cargo.',
      ],
      redFlags: ['No responder y no respirar, o respirar de forma anormal, es una emergencia. No espere una respuesta de la IA.'],
      sourceTitles: ['American Heart Association: Atención del paro cardíaco', 'American Heart Association: Soporte vital básico en adultos', 'American Heart Association: RCP solo con las manos y RCP con ventilaciones'],
    },
    sprains: {
      title: 'Esguinces y distensiones',
      summary: 'Proteja y deje descansar la zona al principio, use compresas frías envueltas y busque ayuda si hay signos de fractura.',
      scope: 'Cuidados iniciales ante posibles lesiones de músculos o ligamentos. Una guía no puede descartar una fractura.',
      keywords: ['esguince', 'esguinces', 'distension', 'distensiones', 'torcedura', 'torceduras', 'tobillo torcido', 'tiron muscular'],
      steps: [
        'Durante los primeros 2–3 días, proteja la lesión, suspenda el ejercicio y evite apoyar peso sobre la zona.',
        'Aplique una compresa fría envuelta en una toalla durante un máximo de 20 minutos cada 2–3 horas.',
        'Use una venda de soporte durante el día y eleve la zona lesionada sobre almohadas.',
        'Al principio, evite el calor, el alcohol y los masajes. Empiece a mover la zona suavemente cuando el dolor ya no lo impida.',
      ],
      redFlags: [
        'Busque atención de emergencia si oyó un chasquido al lesionarse, la zona cambió de forma, hay entumecimiento u hormigueo, o la piel está fría, azulada o gris.',
        'Consulte pronto si el dolor o la hinchazón son intensos o empeoran, no puede caminar unos pasos, tiene fiebre o no mejora.',
      ],
      sourceTitles: ['NHS: Esguinces y distensiones'],
    },
  },
};

export const GUIDE_LABELS = {
  en: {
    allGuides: 'All guides', reference: 'First-aid reference', getHelp: 'When to get help', sources: 'Sources',
    checked: 'Sources checked', note: 'Summaries and translations are for general education; they have not been clinically reviewed. Source links need internet and may be in English.',
    eyebrow: 'Your pocket first-aid kit', heading: 'Know the next step.',
    description: 'Clear first-aid guides, ready without an AI download. Saved for offline use after your first visit finishes loading.',
    search: 'Search first-aid guides', placeholder: 'Search cuts, burns, choking…',
    noMatches: 'No guide matches that search. Try “burns” or “cuts”, or clear the search to see all six topics. This library cannot assess symptoms.',
    guide: 'Guide', scope: 'Scope', contextHelp: 'Get help', contextNote: 'Summary and translation have not been clinically reviewed.',
  },
  es: {
    allGuides: 'Todas las guías', reference: 'Referencia de primeros auxilios', getHelp: 'Cuándo buscar ayuda', sources: 'Fuentes',
    checked: 'Fuentes consultadas', note: 'Los resúmenes y las traducciones son para educación general; no han sido revisados clínicamente. Los enlaces necesitan internet y pueden estar en inglés.',
    eyebrow: 'Su botiquín de bolsillo', heading: 'Sepa qué hacer a continuación.',
    description: 'Guías claras de primeros auxilios, sin descargar una IA. Se guardan para usarlas sin conexión cuando termina de cargar su primera visita.',
    search: 'Buscar guías de primeros auxilios', placeholder: 'Buscar cortes, quemaduras, atragantamiento…',
    noMatches: 'No hay una guía para esa búsqueda. Pruebe «quemaduras» o «cortes», o borre la búsqueda para ver los seis temas. Esta biblioteca no puede evaluar síntomas.',
    guide: 'Guía', scope: 'Alcance', contextHelp: 'Busque ayuda', contextNote: 'El resumen y la traducción no han sido revisados clínicamente.',
  },
};

export function resolveGuideLanguage(language = 'en') {
  const base = typeof language === 'string' ? language.toLowerCase().split(/[-_]/u)[0] : 'en';
  return Object.hasOwn(GUIDE_LABELS, base) ? base : 'en';
}
