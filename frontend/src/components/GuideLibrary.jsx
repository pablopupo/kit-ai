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
    headingRef.current?.focus({ preventScroll: true })
  }, [selectedId])
  const guides = query.trim() ? searchGuides(query, guideLanguage) : allGuides
  if (selected) return (
    <article lang={guideLanguage} className="max-w-2xl mx-auto">
      <button className="kit-text-button mb-6" onClick={() => setSelectedId(null)}><ArrowLeft size={18} /> {labels.allGuides}</button>
      <p className="text-sm text-teal-700 dark:text-teal-300 mb-2">{labels.reference}</p>
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-extrabold mb-3">{selected.title}</h1>
      <p className="text-slate-600 dark:text-slate-300 mb-3">{selected.summary}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-7">{selected.scope}</p>
      <ol className="space-y-5 list-decimal pl-6 marker:font-bold marker:text-teal-700 dark:marker:text-teal-300">
        {selected.steps.map((step, i) => <li key={i} className="pl-2 leading-relaxed">{step}</li>)}
      </ol>
      <section className="mt-8 border-l-4 border-rose-400 bg-rose-50 dark:bg-rose-950/20 p-5 rounded-r-xl">
        <h2 className="font-bold mb-3">{labels.getHelp}</h2>
        <ul className="list-disc pl-5 space-y-2">{selected.redFlags.map(flag => <li key={flag}>{flag}</li>)}</ul>
      </section>
      <footer className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-700 text-sm">
        <p className="font-bold mb-2">{labels.sources}</p>
        {selected.sources.map(source => <a className="flex items-center gap-2 py-2 text-teal-800 dark:text-teal-300 underline" key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={15} /></a>)}
        <p className="text-slate-500 mt-3">{labels.checked} {selected.checkedAt}. {labels.note}</p>
      </footer>
    </article>
  )
  return (
    <section lang={guideLanguage}>
      <div className="mb-8 max-w-xl">
        <p className="text-teal-800 dark:text-teal-300 text-sm font-bold mb-3">{labels.eyebrow}</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">{labels.heading}</h1>
        <p className="text-slate-600 dark:text-slate-300 text-lg">{labels.description}</p>
      </div>
      <label className="flex items-center gap-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-kit-dark-bg-light px-4 mb-7">
        <Search size={20} className="text-slate-400" />
        <input type="search" aria-label={labels.search} className="min-w-0 w-full py-3.5 bg-transparent outline-none text-base" value={query} onChange={e => setQuery(e.target.value)} placeholder={labels.placeholder} />
      </label>
      <div className="divide-y divide-slate-200 dark:divide-slate-700 border-y border-slate-200 dark:border-slate-700">
        {guides.map(guide => <button key={guide.id} onClick={() => setSelectedId(guide.id)} className="w-full flex items-center gap-4 py-5 px-2 text-left hover:bg-teal-50 dark:hover:bg-teal-950/20 rounded-lg">
          <span className="flex-1"><span className="block text-lg font-bold mb-1">{guide.title}</span><span className="block text-sm text-slate-600 dark:text-slate-400">{guide.summary}</span></span><ChevronRight size={20} className="text-teal-700 shrink-0" />
        </button>)}
      </div>
      {guides.length === 0 && <p className="py-8 text-slate-600 dark:text-slate-300">{labels.noMatches}</p>}
    </section>
  )
}
