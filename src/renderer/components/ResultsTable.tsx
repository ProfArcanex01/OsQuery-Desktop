import { useEffect, useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState
} from '@tanstack/react-table'

interface Props {
  rows: Record<string, string>[]
  error: string | null
  executionTimeMs: number
  isLoading: boolean
}

export function ResultsTable({ rows, error, executionTimeMs, isLoading }: Props): JSX.Element {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table')
  const [showAllRows, setShowAllRows] = useState(false)
  const previewLimit = 500

  const visibleRows = useMemo(
    () => (showAllRows ? rows : rows.slice(0, previewLimit)),
    [rows, showAllRows]
  )

  const isPreviewing = !showAllRows && rows.length > previewLimit

  useEffect(() => {
    if (rows.length <= previewLimit) {
      setShowAllRows(false)
    }
  }, [rows.length])

  const columns = useMemo(() => {
    if (!visibleRows.length) return []
    const helper = createColumnHelper<Record<string, string>>()
    return Object.keys(visibleRows[0]).map((key) =>
      helper.accessor(key, {
        header: key,
        cell: (info) => (
          <span className="font-mono text-xs selectable">{info.getValue()}</span>
        )
      })
    )
  }, [visibleRows])

  const table = useReactTable({
    data: visibleRows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  })

  const handleExportCSV = (): void => {
    if (!rows.length) return
    const headers = Object.keys(rows[0]).join(',')
    const csvRows = rows.map((r) =>
      Object.values(r)
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',')
    )
    const csv = [headers, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'osquery-results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#151b28] rounded-lg border border-[#1e293b]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Running query…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-[#151b28] rounded-lg border border-red-900/40">
        <div className="flex flex-col items-center gap-2 max-w-md text-center px-6">
          <span className="text-2xl">⚠️</span>
          <span className="text-sm font-medium text-red-400">Query Error</span>
          <span className="text-xs text-slate-400 font-mono selectable">{error}</span>
        </div>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-full bg-[#151b28] rounded-lg border border-[#1e293b]">
        <span className="text-sm text-slate-600">Run a query to see results</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#151b28] rounded-lg border border-[#1e293b] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1e293b] flex-shrink-0">
        <span className="text-xs text-slate-400">
          <span className="text-emerald-400 font-semibold">{rows.length}</span> rows
          {executionTimeMs > 0 && (
            <span className="text-slate-600 ml-2">in {executionTimeMs}ms</span>
          )}
        </span>
        {isPreviewing && (
          <span className="text-[11px] text-amber-300">
            Showing first {previewLimit} rows to keep the UI responsive
          </span>
        )}
        <input
          className="ml-auto w-48 text-xs bg-[#0f1117] border border-[#1e293b] rounded px-2 py-1 text-slate-300 placeholder-slate-600 outline-none focus:border-slate-500 selectable"
          placeholder="Filter results…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
        />
        {rows.length > previewLimit && (
          <button
            onClick={() => setShowAllRows((current) => !current)}
            className="px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
            title={showAllRows ? 'Show preview rows only' : 'Render all rows'}
          >
            {showAllRows ? 'Preview Rows' : 'Show All'}
          </button>
        )}
        <div className="flex gap-1">
          {(['table', 'json'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                viewMode === m ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={handleExportCSV}
          className="px-2 py-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          title="Export CSV"
        >
          ↓ CSV
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto selectable">
        {viewMode === 'json' ? (
          <pre className="text-xs text-emerald-300 p-4 font-mono">
            {JSON.stringify(rows, null, 2)}
          </pre>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-[#0f1117] z-10">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="text-left px-3 py-2 text-slate-500 font-medium border-b border-[#1e293b] whitespace-nowrap cursor-pointer hover:text-slate-300 select-none"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && ' ↑'}
                      {header.column.getIsSorted() === 'desc' && ' ↓'}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row, i) => (
                <tr
                  key={row.id}
                  className={i % 2 === 0 ? 'bg-transparent' : 'bg-[#0f1117]/40'}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="px-3 py-1.5 text-slate-300 border-b border-[#1e293b]/50 max-w-xs truncate"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
