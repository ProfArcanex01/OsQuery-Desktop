import { contextBridge, ipcRenderer } from 'electron'

/** Typed API exposed to the renderer via window.api */
export const api = {
  // ── Queries ──────────────────────────────────────────────────────────
  runQuery: (sql: string, nlInput?: string) =>
    ipcRenderer.invoke('query:run', sql, nlInput),

  // ── Schema ───────────────────────────────────────────────────────────
  listTables: (): Promise<string[]> => ipcRenderer.invoke('schema:list'),
  getTable: (name: string) => ipcRenderer.invoke('schema:table', name),

  // ── NLP ──────────────────────────────────────────────────────────────
  translateToSQL: (question: string): Promise<string> =>
    ipcRenderer.invoke('nlp:translate', question),
  summarizeResults: (
    question: string,
    sql: string,
    rows: Record<string, string>[]
  ): Promise<string> => ipcRenderer.invoke('nlp:summarize', question, sql, rows),

  // ── Agent Mode ────────────────────────────────────────────────────────
  createAgentPlan: (goal: string) => ipcRenderer.invoke('agent:create-plan', goal),
  executeAgentPlan: (plan: unknown) => ipcRenderer.invoke('agent:execute-plan', plan),

  // ── History ──────────────────────────────────────────────────────────
  listHistory: () => ipcRenderer.invoke('history:list'),
  bookmarkQuery: (sql: string, nlInput?: string) =>
    ipcRenderer.invoke('history:bookmark', sql, nlInput),
  toggleFavorite: (id: number) => ipcRenderer.invoke('history:toggle-favorite', id),
  deleteHistory: (id: number) => ipcRenderer.invoke('history:delete', id),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // ── Settings ─────────────────────────────────────────────────────────
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  getSystemHealth: () => ipcRenderer.invoke('system:get-health'),
  onSystemHealth: (handler: (health: unknown) => void): (() => void) => {
    const listener = (_event: unknown, health: unknown) => handler(health)
    ipcRenderer.on('system:health', listener)
    return () => {
      ipcRenderer.removeListener('system:health', listener)
    }
  },

  // ── Query Repair ─────────────────────────────────────────────────────
  repairSQL: (sql: string, error: string, nlInput?: string) =>
    ipcRenderer.invoke('query:repair-sql', sql, error, nlInput),

  // ── Osquery Console / Logs ───────────────────────────────────────────
  onOsqueryStderr: (handler: (message: string) => void): (() => void) => {
    const listener = (_event: unknown, message: string) => handler(message)
    ipcRenderer.on('osquery:stderr', listener)
    return () => {
      ipcRenderer.removeListener('osquery:stderr', listener)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)

// Make TypeScript happy in the renderer
declare global {
  interface Window {
    api: typeof api
  }
}
