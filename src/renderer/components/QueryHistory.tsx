import { useState, useEffect } from 'react'

interface HistoryEntry {
  id: number
  sql: string
  nlInput: string | null
  rowCount: number
  executionTimeMs: number
  savedAt: string
  isFavorite: boolean
}

interface Props {
  onSelect: (sql: string) => void
}

export function QueryHistory({ onSelect }: Props): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [filter, setFilter] = useState<'all' | 'favorites'>('all')

  const reload = (): void => {
    window.api.listHistory().then((h) => setEntries(h as HistoryEntry[]))
  }

  useEffect(() => { reload() }, [])

  const visible = filter === 'favorites' ? entries.filter((e) => e.isFavorite) : entries

  const handleToggleFavorite = async (e: React.MouseEvent, id: number): Promise<void> => {
    e.stopPropagation()
    await window.api.toggleFavorite(id)
    reload()
  }

  const handleDelete = async (e: React.MouseEvent, id: number): Promise<void> => {
    e.stopPropagation()
    await window.api.deleteHistory(id)
    reload()
  }

  const handleClear = async (): Promise<void> => {
    if (confirm('Clear all non-favorited queries?')) {
      await window.api.clearHistory()
      reload()
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 p-3 gap-3">
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex gap-1">
          {(['all', 'favorites'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${
                filter === f ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={handleClear}
          className="ml-auto text-xs text-slate-600 hover:text-red-400 transition-colors"
        >
          Clear history
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
        {visible.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-600 text-sm">
            No queries yet
          </div>
        ) : (
          visible.map((entry) => (
            <div
              key={entry.id}
              onClick={() => onSelect(entry.sql)}
              className="group bg-[#151b28] border border-[#1e293b] hover:border-slate-600 rounded-lg px-3 py-2.5 cursor-pointer transition-colors"
            >
              {entry.nlInput && (
                <p className="text-xs text-violet-400 mb-1 truncate">"{entry.nlInput}"</p>
              )}
              <p className="text-xs font-mono text-slate-300 truncate selectable">{entry.sql}</p>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px] text-slate-600">{entry.savedAt.slice(0, 16)}</span>
                <span className="text-[10px] text-emerald-600">{entry.rowCount} rows</span>
                <span className="text-[10px] text-slate-600">{entry.executionTimeMs}ms</span>
                <div className="ml-auto flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => handleToggleFavorite(e, entry.id)}
                    className={`text-xs transition-colors ${entry.isFavorite ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}
                  >
                    {entry.isFavorite ? '★' : '☆'}
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, entry.id)}
                    className="text-xs text-slate-600 hover:text-red-400 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
