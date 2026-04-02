import { useState, useEffect, useMemo } from 'react'

interface ColumnDef { name: string; type: string }
interface TableDef { name: string; columns: ColumnDef[] }
interface SystemHealth {
  osqueryReady: boolean
  schemaReady: boolean
  startupError: string | null
}

interface Props {
  onInsertTable: (name: string) => void
}

export function SchemaSidebar({ onInsertTable }: Props): JSX.Element {
  const [tables, setTables] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [tableDetail, setTableDetail] = useState<Record<string, TableDef>>({})
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadTables = async (): Promise<void> => {
    setIsLoading(true)
    try {
      const nextTables = await window.api.listTables()
      setTables(nextTables)
      setLoadError(
        nextTables.length === 0 ? 'Schema is still loading. Retry in a moment.' : null
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load tables.'
      setLoadError(message)
      setTables([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadTables()
  }, [])

  useEffect(() => {
    if (!window.api?.onSystemHealth) return
    return window.api.onSystemHealth((health) => {
      const nextHealth = health as SystemHealth
      if (nextHealth.schemaReady || nextHealth.startupError) {
        void loadTables()
      }
    })
  }, [])

  const filtered = useMemo(
    () => tables.filter((t) => t.includes(search.toLowerCase())),
    [tables, search]
  )

  const handleExpand = async (name: string): Promise<void> => {
    if (expanded === name) { setExpanded(null); return }
    setExpanded(name)
    if (!tableDetail[name]) {
      const detail = await window.api.getTable(name)
      if (detail) setTableDetail((d) => ({ ...d, [name]: detail }))
    }
  }

  return (
    <div className="w-52 flex-shrink-0 flex flex-col bg-[#0d1219] border-r border-[#1e293b] overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-10 pb-2 flex-shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
          Tables
        </p>
        <input
          className="w-full text-xs bg-[#151b28] border border-[#1e293b] rounded px-2 py-1.5 text-slate-300 placeholder-slate-600 outline-none focus:border-slate-500 selectable"
          placeholder="Search tables…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-xs text-slate-600">Loading…</span>
          </div>
        ) : loadError ? (
          <div className="px-3 py-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              <div>{loadError}</div>
              <button
                onClick={() => void loadTables()}
                className="mt-2 text-[11px] font-medium text-amber-200 hover:text-white"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-20">
            <span className="text-xs text-slate-600">
              {tables.length === 0 ? 'No tables available' : 'No matching tables'}
            </span>
          </div>
        ) : (
          filtered.map((name) => (
            <div key={name}>
              <div
                className="flex items-center gap-1 px-3 py-1.5 cursor-pointer hover:bg-[#151b28] group"
                onClick={() => handleExpand(name)}
              >
                <span className={`text-[10px] text-slate-600 transition-transform ${expanded === name ? 'rotate-90' : ''}`}>▶</span>
                <span className="text-xs text-slate-300 truncate flex-1 font-mono">{name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onInsertTable(name) }}
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-500 hover:text-violet-400 px-1"
                  title="Insert SELECT"
                >
                  ↗
                </button>
              </div>

              {expanded === name && tableDetail[name] && (
                <div className="bg-[#151b28]/50 border-l-2 border-violet-800/40 ml-6 mb-1">
                  {tableDetail[name].columns.map((col) => (
                    <div key={col.name} className="flex items-center gap-2 px-2 py-0.5">
                      <span className="text-[10px] font-mono text-slate-400 truncate">{col.name}</span>
                      <span className="text-[9px] text-slate-600 ml-auto flex-shrink-0">{col.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
