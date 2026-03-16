import { ipcMain } from 'electron'
import { osqueryManager, historyStore, schemaCache, agentService, settingsStore } from './index'
import { createLLMProvider } from './llm'

export function registerIpcHandlers(): void {
  // ── Query ──────────────────────────────────────────────────────────────
  ipcMain.handle('query:run', async (_event, sql: string, nlInput?: string) => {
    const result = await osqueryManager.runQuery(sql)
    historyStore.add({
      sql,
      nlInput: nlInput ?? null,
      rowCount: result.rows.length,
      executionTimeMs: result.executionTimeMs,
      isFavorite: false
    })
    return result
  })

  ipcMain.handle(
    'query:repair-sql',
    async (_event, sql: string, error: string, nlInput?: string) => {
      const provider = createLLMProvider(settingsStore)
      const tableNames = schemaCache.inferRelevantTables(nlInput || sql)
      const schemaCtx = schemaCache.getSchemaContext(tableNames)
      const repaired = await provider.translateToSQL(
        nlInput
          ? `${nlInput}\n\nThe previous SQL failed with error:\n${error}\n\nPrevious SQL:\n${sql}`
          : `The following osquery SQL failed with error:\n${error}\n\nSQL:\n${sql}\n\nPlease return a corrected osquery SQL query only.`,
        schemaCtx
      )
      return { sql: repaired }
    }
  )

  // ── Schema ─────────────────────────────────────────────────────────────
  ipcMain.handle('schema:list', () => schemaCache.getAllTableNames())

  ipcMain.handle('schema:table', (_event, name: string) => schemaCache.getTable(name))

  // ── NLP ────────────────────────────────────────────────────────────────
  ipcMain.handle('nlp:translate', async (_event, question: string) => {
    const provider = createLLMProvider(settingsStore)
    const tableNames = schemaCache.inferRelevantTables(question)
    const schemaCtx = schemaCache.getSchemaContext(tableNames)
    return provider.translateToSQL(question, schemaCtx)
  })

  ipcMain.handle(
    'nlp:summarize',
    async (_event, question: string, sql: string, rows: Record<string, string>[]) => {
      const provider = createLLMProvider(settingsStore)
      return provider.summarizeResults(question, sql, rows)
    }
  )

  // ── Agent Mode ─────────────────────────────────────────────────────────
  ipcMain.handle('agent:create-plan', (_event, goal: string) =>
    agentService.createPlan(goal)
  )
  ipcMain.handle('agent:execute-plan', (_event, plan) =>
    agentService.executePlan(plan)
  )

  // ── History ────────────────────────────────────────────────────────────
  ipcMain.handle('history:list', () => historyStore.list())
  ipcMain.handle('history:bookmark', (_event, sql: string, nlInput?: string) =>
    historyStore.bookmark(sql, nlInput ?? null)
  )
  ipcMain.handle('history:toggle-favorite', (_event, id: number) =>
    historyStore.toggleFavorite(id)
  )
  ipcMain.handle('history:delete', (_event, id: number) => historyStore.delete(id))
  ipcMain.handle('history:clear', () => historyStore.clear())

  // ── Settings ───────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => ({
    llmProvider: settingsStore.get('llmProvider', 'claude'),
    apiKey: settingsStore.get('apiKey', ''),
    ollamaModel: settingsStore.get('ollamaModel', 'llama3'),
    ollamaUrl: settingsStore.get('ollamaUrl', 'http://localhost:11434')
  }))

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    settingsStore.set(key, value)
  })
}
