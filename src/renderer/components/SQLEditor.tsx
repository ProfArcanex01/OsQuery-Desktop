import { useEffect, useRef, KeyboardEvent } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { sql } from '@codemirror/lang-sql'
import { oneDark } from '@codemirror/theme-one-dark'

interface Props {
  value: string
  onChange: (v: string) => void
  onRun: (sql: string) => void
  onBookmark: (sql: string) => void
  isRunning: boolean
}

export function SQLEditor({ value, onChange, onRun, onBookmark, isRunning }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onRunRef = useRef(onRun)
  onRunRef.current = onRun

  useEffect(() => {
    if (!containerRef.current) return

    const runKeymap = keymap.of([
      {
        key: 'Mod-Enter',
        run: (view) => {
          onRunRef.current(view.state.doc.toString())
          return true
        }
      }
    ])

    const state = EditorState.create({
      doc: value,
      extensions: [
        oneDark,
        sql(),
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        runKeymap,
        EditorView.theme({
          '&': { background: '#151b28', height: '100%' },
          '.cm-content': { padding: '8px 0' },
          '.cm-gutters': { background: '#151b28', borderRight: '1px solid #1e293b' }
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString())
          }
        })
      ]
    })

    viewRef.current = new EditorView({ state, parent: containerRef.current })

    return () => viewRef.current?.destroy()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external value changes (e.g. from NL translation)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value }
      })
    }
  }, [value])

  return (
    <div className="flex flex-col h-full bg-[#151b28] rounded-lg border border-[#1e293b] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1e293b] flex-shrink-0">
        <span className="text-[11px] text-slate-500 font-mono">SQL Editor</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-600">⌘↵ to run</span>
          <button
            onClick={() => onBookmark(value)}
            disabled={!value.trim()}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
              !value.trim()
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
            }`}
          >
            <span>☆</span> Bookmark
          </button>
          <button
            onClick={() => onRun(value)}
            disabled={isRunning || !value.trim()}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
              isRunning
                ? 'bg-emerald-900/40 text-emerald-400 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isRunning ? (
              <>
                <span className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                Running…
              </>
            ) : (
              <>
                <span>▶</span> Run
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div ref={containerRef} className="flex-1 overflow-hidden selectable" />
    </div>
  )
}
