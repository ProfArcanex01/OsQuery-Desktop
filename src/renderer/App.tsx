import { useState, useEffect, useCallback } from 'react'
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
  bookmarkNotice: ''
}

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>('query')
  const [state, setState] = useState<QueryState>(DEFAULT_STATE)

  const updateState = (partial: Partial<QueryState>): void =>
    setState((s) => ({ ...s, ...partial }))

  // Translate NL → SQL
  const handleTranslate = useCallback(async (question: string) => {
    if (!question.trim()) return
    updateState({ isTranslating: true, nlInput: question, error: null })
    try {
      const sql = await window.api.translateToSQL(question)
      updateState({ sql, isTranslating: false, error: null })
    } catch (e: any) {
      updateState({ error: e.message, isTranslating: false })
    }
  }, [])

  // Run SQL
  const handleRun = useCallback(async (sql: string) => {
    updateState({ isRunning: true, error: null, summary: '', rows: [] })
    try {
      const result = await window.api.runQuery(sql, state.nlInput || undefined)
      updateState({
        rows: result.rows,
        executionTimeMs: result.executionTimeMs,
        isRunning: false
      })
      // Auto-summarize if there was an NL question
      if (state.nlInput && result.rows.length > 0) {
        updateState({ isSummarizing: true })
        try {
          const summary = await window.api.summarizeResults(state.nlInput, sql, result.rows)
          updateState({ summary, isSummarizing: false })
        } catch {
          updateState({ isSummarizing: false })
        }
      }
    } catch (e: any) {
      updateState({ error: e.message, isRunning: false })
    }
  }, [state.nlInput])

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
          </div>
        </div>

        {/* Content */}
        {tab === 'query' && (
          <div className="flex flex-col flex-1 min-h-0 p-3 gap-3">
            {/* NL Input */}
            <NLInput
              value={state.nlInput}
              isTranslating={state.isTranslating}
              onTranslate={handleTranslate}
              onChange={(v) => updateState({ nlInput: v })}
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

            {state.error && (
              <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                <span className="mt-0.5 text-red-300">!</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-red-200">Error</div>
                  <div className="text-xs text-red-100/90 selectable break-words">{state.error}</div>
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
                isRunning={state.isRunning}
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
