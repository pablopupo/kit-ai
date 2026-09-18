import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, ArrowUpRight, Search, ChevronRight } from 'lucide-react'
import { getGuides, searchGuides } from '../services/firstAidGuides'
import { GUIDE_LABELS, resolveGuideLanguage } from '../services/guideTranslations'
import { useSettings } from '../contexts/SettingsContext'

export default function GuideLibrary() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const { language } = useSettings()
  const guideLanguage = resolveGuideLanguage(language)
  const labels = GUIDE_LABELS[guideLanguage]
  const allGuides = getGuides(guideLanguage)
  const selected = allGuides.find(guide => guide.id === selectedId)
  const headingRef = useRef(null)
  const previousSelection = useRef(selectedId)
  useEffect(() => {
    if (previousSelection.current === selectedId) return
    previousSelection.current = selectedId
    headingRef.current?.closest('main')?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [selectedId])
  const guides = query.trim() ? searchGuides(query, guideLanguage) : allGuides
  if (selected) return (
    <article lang={guideLanguage} className="max-w-2xl mx-auto">
      <button className="kit-text-button mb-6 rounded-full bg-kit-teal-light dark:bg-kit-teal-dark/15 px-4" onClick={() => setSelectedId(null)}><ArrowLeft size={18} /> {labels.allGuides}</button>
      <p className="inline-flex rounded-full bg-kit-red-light dark:bg-kit-red-dark/15 px-3 py-1.5 text-sm font-bold text-rose-800 dark:text-rose-200 mb-3">{labels.reference}</p>
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-display font-bold mb-3">{selected.title}</h1>
      <p className="text-slate-600 dark:text-slate-300 mb-3">{selected.summary}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-7">{selected.scope}</p>
      <ol className="space-y-4 list-decimal pl-6 marker:font-extrabold marker:text-teal-800 dark:marker:text-teal-300">
        {selected.steps.map((step, i) => <li key={i} className="pl-3 leading-relaxed">{step}</li>)}
      </ol>
      <section className="mt-8 border border-rose-100 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 p-5 sm:p-6 rounded-3xl">
        <h2 className="font-bold mb-3">{labels.getHelp}</h2>
        <ul className="list-disc pl-5 space-y-2">{selected.redFlags.map(flag => <li key={flag}>{flag}</li>)}</ul>
      </section>
      <footer className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-700 text-sm">
        <p className="font-bold mb-2">{labels.sources}</p>
        {selected.sources.map(source => <a className="flex items-center gap-2 min-h-11 py-2 text-teal-800 dark:text-teal-300 underline underline-offset-4" key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={15} className="shrink-0" /></a>)}
        <p className="text-slate-500 mt-3">{labels.checked} {selected.checkedAt}. {labels.note}</p>
      </footer>
    </article>
  )
  return (
    <section lang={guideLanguage}>
      <div className="mb-8 max-w-xl">
        <p className="inline-flex rounded-full bg-kit-teal-light dark:bg-kit-teal-dark/15 px-3 py-1.5 text-teal-800 dark:text-teal-300 text-sm font-bold mb-4">{labels.eyebrow}</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl sm:text-4xl font-display font-bold tracking-tight mb-4">{labels.heading}</h1>
        <p className="text-slate-600 dark:text-slate-300 text-lg">{labels.description}</p>
      </div>
      <label className="flex items-center gap-3 border border-teal-100 dark:border-slate-600 rounded-full bg-white dark:bg-kit-dark-bg-light shadow-sm px-5 mb-6 focus-within:border-teal-600">
        <Search size={20} className="text-teal-700 dark:text-teal-300 shrink-0" />
        <input type="search" aria-label={labels.search} className="min-w-0 w-full py-3.5 bg-transparent outline-none text-base" value={query} onChange={e => setQuery(e.target.value)} placeholder={labels.placeholder} />
      </label>
      <div className="space-y-3">
        {guides.map(guide => <button key={guide.id} onClick={() => setSelectedId(guide.id)} className="w-full flex items-center gap-4 p-5 sm:p-6 text-left border border-teal-100/70 dark:border-slate-700 bg-[#F2FAF8] dark:bg-kit-dark-bg-light hover:bg-kit-teal-light dark:hover:bg-teal-950/20 active:bg-[#D2EEEA] rounded-3xl transition-colors">
          <span className="min-w-0 flex-1"><span className="block text-lg font-bold mb-1">{guide.title}</span><span className="block text-sm leading-relaxed text-slate-600 dark:text-slate-400">{guide.summary}</span></span><span className="flex items-center justify-center w-9 h-9 bg-white dark:bg-kit-dark-bg rounded-full text-teal-800 dark:text-teal-300 shrink-0"><ChevronRight size={19} /></span>
        </button>)}
      </div>
      {guides.length === 0 && <p className="py-8 text-slate-600 dark:text-slate-300">{labels.noMatches}</p>}
    </section>
  )
}
