import { useState, useEffect, useCallback, useMemo, useTransition } from 'react'
import { NLInput } from './components/NLInput'
import { SQLEditor } from './components/SQLEditor'
import { ResultsTable } from './components/ResultsTable'
import { SchemaSidebar } from './components/SchemaSidebar'
import { SummaryCard } from './components/SummaryCard'
import { QueryHistory } from './components/QueryHistory'
import { Settings } from './components/Settings'
import { AgentMode } from './components/AgentMode'

type Tab = 'query' | 'agent' | 'history' | 'settings'

export interface QueryState {
  sql: string
  nlInput: string
  rows: Record<string, string>[]
  error: string | null
  executionTimeMs: number
  summary: string
  isRunning: boolean
  isSummarizing: boolean
  isTranslating: boolean
  bookmarkNotice: string
  isRepairing: boolean
  osqueryLogs: string[]
}

interface SystemHealth {
  osqueryReady: boolean
  schemaReady: boolean
  startupError: string | null
}

const DEFAULT_STATE: QueryState = {
  sql: '-- Start typing a question above, or write SQL directly here.\nSELECT * FROM osquery_info LIMIT 5;',
  nlInput: '',
  rows: [],
  error: null,
  executionTimeMs: 0,
  summary: '',
  isRunning: false,
  isSummarizing: false,
  isTranslating: false,
  bookmarkNotice: '',
  isRepairing: false,
  osqueryLogs: []
}

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('query')
  const [state, setState] = useState<QueryState>(DEFAULT_STATE)
  const [systemHealth, setSystemHealth] = useState<SystemHealth>({
    osqueryReady: true,
    schemaReady: true,
    startupError: null
  })
  const [isPending, startTransition] = useTransition()

  const updateState = (partial: Partial<QueryState>): void =>
    setState((s) => ({ ...s, ...partial }))

  const activityLabel = useMemo(() => {
    if (state.isRunning) return 'Executing osquery command...'
    if (state.isTranslating) return 'Generating SQL from your prompt...'
    if (state.isRepairing) return 'Repairing SQL with the LLM...'
    if (state.isSummarizing) return 'Summarizing query results...'
    if (isPending) return 'Rendering results...'
    return null
  }, [isPending, state.isRepairing, state.isRunning, state.isSummarizing, state.isTranslating])

  useEffect(() => {
    window.api.getSystemHealth().then((health) => {
      setSystemHealth(health as SystemHealth)
    }).catch(() => {
      setSystemHealth({
        osqueryReady: false,
        schemaReady: false,
        startupError: 'Failed to load backend health status.'
      })
    })
  }, [])

  useEffect(() => {
    if (!window.api?.onSystemHealth) return
    return window.api.onSystemHealth((health) => {
      startTransition(() => {
        setSystemHealth(health as SystemHealth)
      })
    })
  }, [])

  // Subscribe to osquery stderr stream for console view.
  useEffect(() => {
    if (!window.api?.onOsqueryStderr) return
    const dispose = window.api.onOsqueryStderr((message: string) => {
      startTransition(() => {
        setState((s) => ({
          ...s,
          osqueryLogs: [...s.osqueryLogs, message]
        }))
      })
    })
    return () => {
      dispose?.()
    }
  }, [])

  // Translate NL → SQL
  const handleTranslate = useCallback(async (question: string) => {
    if (!question.trim()) return
    if (!systemHealth.osqueryReady) {
      updateState({ error: systemHealth.startupError ?? 'osquery is not available.' })
      return
    }
    updateState({ isTranslating: true, nlInput: question, error: null })
    try {
      const sql = await window.api.translateToSQL(question)
      startTransition(() => {
        updateState({ sql, isTranslating: false, error: null })
      })
    } catch (e: any) {
      updateState({ error: e.message, isTranslating: false })
    }
  }, [systemHealth.osqueryReady, systemHealth.startupError])

  // Run SQL
  const handleRun = useCallback(async (sql: string) => {
    if (!systemHealth.osqueryReady) {
      updateState({ error: systemHealth.startupError ?? 'osquery is not available.' })
      return
    }
    updateState({ isRunning: true, isRepairing: false, error: null, summary: '', rows: [] })
    try {
      const result = await window.api.runQuery(sql, state.nlInput || undefined)
      if (result.error) {
        updateState({
          rows: result.rows,
          executionTimeMs: result.executionTimeMs,
          error: result.error,
          isRunning: false
        })
        return
      }

      startTransition(() => {
        updateState({
          rows: result.rows,
          executionTimeMs: result.executionTimeMs,
          isRunning: false
        })
      })
      // Auto-summarize if there was an NL question
      if (state.nlInput && result.rows.length > 0) {
        updateState({ isSummarizing: true })
        try {
          const summary = await window.api.summarizeResults(state.nlInput, sql, result.rows)
          startTransition(() => {
            updateState({ summary, isSummarizing: false })
          })
        } catch {
          updateState({ isSummarizing: false })
        }
      }
    } catch (e: any) {
      updateState({ error: e.message, isRunning: false })
    }
  }, [state.nlInput, systemHealth.osqueryReady, systemHealth.startupError])

  const handleRepairSQL = useCallback(async () => {
    if (!state.error || !state.sql.trim()) return
    if (!systemHealth.osqueryReady) return
    updateState({ isRepairing: true })
    try {
      const { sql } = await window.api.repairSQL(state.sql, state.error, state.nlInput || undefined)
      updateState({ sql, isRepairing: false, error: null })
    } catch (e: any) {
      updateState({
        isRepairing: false,
        error: e.message ?? 'Failed to repair SQL using the LLM.'
      })
    }
  }, [state.error, state.nlInput, state.sql, systemHealth.osqueryReady])

  const handleHistorySelect = (sql: string): void => {
    updateState({ sql, nlInput: '' })
    setTab('query')
  }

  const handleBookmark = useCallback(async (sql: string) => {
    if (!sql.trim()) return
    try {
      await window.api.bookmarkQuery(sql, state.nlInput || undefined)
      updateState({ bookmarkNotice: 'Query bookmarked.', error: null })
      window.setTimeout(() => updateState({ bookmarkNotice: '' }), 2000)
    } catch (e: any) {
      updateState({ error: e.message ?? 'Failed to bookmark query.' })
    }
  }, [state.nlInput])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0f1117]">
      {/* Left sidebar */}
      <SchemaSidebar
        onInsertTable={(name) =>
          updateState({ sql: `SELECT * FROM ${name} LIMIT 100;` })
        }
      />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Title bar (macOS drag region) */}
        <div className="titlebar-drag h-10 flex items-center px-4 border-b border-[#1e293b] flex-shrink-0">
          <span className="text-[13px] font-semibold text-slate-400 ml-16 select-none">
            OsQuery Desktop
          </span>
          <div className="titlebar-no-drag ml-auto flex gap-1">
            {(['query', 'agent', 'history', 'settings'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${
                  tab === t
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {t}
              </button>
            ))}
            <button
              onClick={() => setTab('query')}
              className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${
                tab === 'query'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              console
            </button>
          </div>
        </div>

        {/* Content */}
        {tab === 'query' && (
          <div className="flex flex-col flex-1 min-h-0 p-3 gap-3">
            {activityLabel && (
              <div className="flex items-center gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                <span className="h-3 w-3 rounded-full border-2 border-cyan-300 border-t-transparent animate-spin" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-cyan-200">Working</div>
                  <div className="text-xs text-cyan-100/90">{activityLabel}</div>
                </div>
              </div>
            )}

            {/* NL Input */}
            <NLInput
              value={state.nlInput}
              isTranslating={state.isTranslating}
              onTranslate={handleTranslate}
              onChange={(v) => updateState({ nlInput: v, error: null })}
            />

            {/* Summary */}
            {(state.summary || state.isSummarizing) && (
              <SummaryCard summary={state.summary} isLoading={state.isSummarizing} />
            )}

            {state.bookmarkNotice && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {state.bookmarkNotice}
              </div>
            )}

            {!systemHealth.osqueryReady && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <div className="font-medium text-amber-200">Startup Diagnostics</div>
                <div className="mt-1 text-xs break-words">
                  {systemHealth.startupError ?? 'osquery is unavailable.'}
                </div>
                <div className="mt-2 text-xs text-amber-200/80">
                  Install or bundle `osqueryi`, then relaunch the app.
                </div>
              </div>
            )}

            {state.error && (
              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                <span className="mt-0.5 text-red-300">!</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-red-200">Error</div>
                  <div className="text-xs text-red-100/90 selectable break-words">{state.error}</div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    <button
                      onClick={handleRepairSQL}
                      disabled={state.isRepairing || !state.sql.trim()}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
                        state.isRepairing
                          ? 'bg-indigo-900/60 text-indigo-200 cursor-not-allowed'
                          : 'bg-indigo-700/80 hover:bg-indigo-600 text-white'
                      }`}
                    >
                      {state.isRepairing ? (
                        <>
                          <span className="w-3 h-3 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />
                          Asking LLM to fix…
                        </>
                      ) : (
                        <>
                          <span>✨</span>
                          Fix SQL with LLM
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => updateState({ error: null })}
                  className="text-xs text-red-200/70 hover:text-red-100 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* SQL Editor */}
            <div className="flex-shrink-0" style={{ height: 180 }}>
              <SQLEditor
                value={state.sql}
                onChange={(v) => updateState({ sql: v })}
                onRun={handleRun}
                onBookmark={handleBookmark}
                isRunning={state.isRunning || !systemHealth.osqueryReady}
              />
            </div>

            {/* Results */}
            <div className="flex-1 min-h-0">
              <ResultsTable
                rows={state.rows}
                error={state.error}
                executionTimeMs={state.executionTimeMs}
                isLoading={state.isRunning}
              />
            </div>

            {/* Osquery console */}
            {state.osqueryLogs.length > 0 && (
              <div className="mt-2 flex-1 min-h-0 rounded-lg border border-slate-700/70 bg-black/40 text-xs text-slate-200 overflow-hidden flex flex-col">
                <div className="px-3 py-1.5 border-b border-slate-700/70 flex items-center justify-between">
                  <span className="font-semibold text-slate-300">Osquery Console</span>
                  <button
                    onClick={() => updateState({ osqueryLogs: [] })}
                    className="text-[11px] text-slate-400 hover:text-slate-200"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex-1 overflow-auto px-3 py-2 font-mono whitespace-pre-wrap space-y-0.5">
                  {state.osqueryLogs.map((line, idx) => (
                    <div key={idx} className="selectable">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <QueryHistory onSelect={handleHistorySelect} />
        )}

        {tab === 'agent' && (
          <AgentMode />
        )}

        {tab === 'settings' && (
          <Settings />
        )}
      </div>
    </div>
  )
}
