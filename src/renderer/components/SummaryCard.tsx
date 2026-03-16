interface Props {
  summary: string
  isLoading: boolean
}

export function SummaryCard({ summary, isLoading }: Props): JSX.Element {
  return (
    <div className="flex items-start gap-2.5 bg-violet-900/20 border border-violet-700/30 rounded-lg px-3 py-2.5">
      <svg className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
      </svg>
      {isLoading ? (
        <div className="flex items-center gap-2 text-violet-400 text-sm">
          <span className="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
          Summarizing results…
        </div>
      ) : (
        <p className="text-sm text-violet-200 leading-relaxed selectable">{summary}</p>
      )}
    </div>
  )
}
