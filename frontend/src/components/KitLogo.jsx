import { Plus } from 'lucide-react'
import { useSettings } from '../contexts/SettingsContext'

export default function KitLogo({ onNewConversation, small = false }) {
  const { t } = useSettings()
  return (
    <div className={`inline-flex shrink-0 items-center font-extrabold leading-none tracking-tight text-kit-red ${small ? 'text-3xl' : 'text-5xl'}`}>
      <span className="sr-only">Kit AI</span>
      <span aria-hidden="true">ki</span>
      <button
        type="button"
        onClick={onNewConversation}
        aria-label={t('newConversation')}
        title={t('newConversation')}
        className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
      >
        <span className={`inline-flex items-center justify-center rounded-md bg-kit-red text-white transition-colors group-hover:bg-kit-red-hover ${small ? 'h-8 w-8' : 'h-9 w-9'}`}>
          <Plus aria-hidden="true" size={small ? 22 : 26} strokeWidth={4} />
        </span>
      </button>
      <span aria-hidden="true">.ai</span>
    </div>
  )
}
