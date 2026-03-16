import { useState, useRef, KeyboardEvent } from 'react'

interface Props {
  value: string
  isTranslating: boolean
  onTranslate: (question: string) => void
  onChange: (v: string) => void
}

const PLACEHOLDERS = [
  'What processes are listening on port 443?',
  'Show me all running processes with high CPU usage',
  'Which users have logged in recently?',
  'List all installed software on this machine',
  'Are there any suspicious cron jobs?'
]

export function NLInput({ value, isTranslating, onTranslate, onChange }: Props): JSX.Element {
  const [placeholder] = useState(
    () => PLACEHOLDERS[Math.floor(Math.random() * PLACEHOLDERS.length)]
  )
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) onTranslate(value)
    }
  }

  return (
    <div className="flex items-center gap-2 bg-[#151b28] border border-[#1e293b] rounded-lg px-3 py-2 focus-within:border-violet-500/60 transition-colors">
      {/* Sparkle icon */}
      <svg className="w-4 h-4 text-violet-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
      </svg>

      <input
        ref={inputRef}
        className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none selectable"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isTranslating}
      />

      <button
        onClick={() => value.trim() && onTranslate(value)}
        disabled={isTranslating || !value.trim()}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
          isTranslating || !value.trim()
            ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-violet-600 hover:bg-violet-500 text-white'
        }`}
      >
        {isTranslating ? (
          <>
            <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
            Translating…
          </>
        ) : (
          <>
            <span>Generate SQL</span>
            <kbd className="text-[10px] opacity-60">↵</kbd>
          </>
        )}
      </button>
    </div>
  )
}
