import { ipcMain } from 'electron'
import { z } from 'zod'
import { osqueryManager, historyStore, schemaCache, agentService, settingsStore, systemHealth } from './index'
import { createLLMProvider } from './llm'

const settingsSchema = z.object({
  llmProvider: z.enum(['claude', 'openai', 'ollama']),
  apiKey: z.string().max(5000),
  ollamaModel: z.string().trim().min(1).max(200),
  ollamaUrl: z.string().url().max(2048)
})

const settingKeySchema = z.enum(['llmProvider', 'apiKey', 'ollamaModel', 'ollamaUrl'])
const sqlSchema = z.string().trim().min(1).max(50_000)
const textSchema = z.string().trim().min(1).max(20_000)
const optionalTextSchema = z.string().trim().min(1).max(20_000).optional()
const historyIdSchema = z.number().int().positive()
const tableNameSchema = z.string().trim().min(1).max(255)
const rowsSchema = z.array(z.record(z.string(), z.string())).max(1000)

export function registerIpcHandlers(): void {
  // ── Query ──────────────────────────────────────────────────────────────
  ipcMain.handle('query:run', async (_event, sql: string, nlInput?: string) => {
    const parsedSql = sqlSchema.parse(sql)
    const parsedNlInput = optionalTextSchema.parse(nlInput)
    const result = await osqueryManager.runQuery(parsedSql)
    historyStore.add({
      sql: parsedSql,
      nlInput: parsedNlInput ?? null,
      rowCount: result.rows.length,
      executionTimeMs: result.executionTimeMs,
      isFavorite: false
    })
    return result
  })

  ipcMain.handle(
    'query:repair-sql',
    async (_event, sql: string, error: string, nlInput?: string) => {
      const parsedSql = sqlSchema.parse(sql)
      const parsedError = textSchema.parse(error)
      const parsedNlInput = optionalTextSchema.parse(nlInput)
      const provider = createLLMProvider(settingsStore)
      const tableNames = schemaCache.inferRelevantTables(parsedNlInput || parsedSql)
      const schemaCtx = schemaCache.getSchemaContext(tableNames)
      const repaired = await provider.translateToSQL(
        parsedNlInput
          ? `${parsedNlInput}\n\nThe previous SQL failed with error:\n${parsedError}\n\nPrevious SQL:\n${parsedSql}`
          : `The following osquery SQL failed with error:\n${parsedError}\n\nSQL:\n${parsedSql}\n\nPlease return a corrected osquery SQL query only.`,
        schemaCtx
      )
      return { sql: repaired }
    }
  )

  // ── Schema ─────────────────────────────────────────────────────────────
  ipcMain.handle('schema:list', () => schemaCache.getAllTableNames())

  ipcMain.handle('schema:table', (_event, name: string) =>
    schemaCache.getTable(tableNameSchema.parse(name))
  )

  // ── NLP ────────────────────────────────────────────────────────────────
  ipcMain.handle('nlp:translate', async (_event, question: string) => {
    const parsedQuestion = textSchema.parse(question)
    const provider = createLLMProvider(settingsStore)
    const tableNames = schemaCache.inferRelevantTables(parsedQuestion)
    const schemaCtx = schemaCache.getSchemaContext(tableNames)
    return provider.translateToSQL(parsedQuestion, schemaCtx)
  })

  ipcMain.handle(
    'nlp:summarize',
    async (_event, question: string, sql: string, rows: Record<string, string>[]) => {
      const parsedQuestion = textSchema.parse(question)
      const parsedSql = sqlSchema.parse(sql)
      const parsedRows = rowsSchema.parse(rows)
      const provider = createLLMProvider(settingsStore)
      return provider.summarizeResults(parsedQuestion, parsedSql, parsedRows)
    }
  )

  // ── Agent Mode ─────────────────────────────────────────────────────────
  ipcMain.handle('agent:create-plan', (_event, goal: string) =>
    agentService.createPlan(textSchema.parse(goal))
  )
  ipcMain.handle('agent:execute-plan', (_event, plan) =>
    agentService.executePlan(plan)
  )

  // ── History ────────────────────────────────────────────────────────────
  ipcMain.handle('history:list', () => historyStore.list())
  ipcMain.handle('history:bookmark', (_event, sql: string, nlInput?: string) =>
    historyStore.bookmark(sqlSchema.parse(sql), optionalTextSchema.parse(nlInput) ?? null)
  )
  ipcMain.handle('history:toggle-favorite', (_event, id: number) =>
    historyStore.toggleFavorite(historyIdSchema.parse(id))
  )
  ipcMain.handle('history:delete', (_event, id: number) =>
    historyStore.delete(historyIdSchema.parse(id))
  )
  ipcMain.handle('history:clear', () => historyStore.clear())

  ipcMain.handle('system:get-health', () => ({ ...systemHealth }))

  // ── Settings ───────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => ({
    llmProvider: settingsStore.get('llmProvider', 'claude'),
    apiKey: settingsStore.get('apiKey', ''),
    ollamaModel: settingsStore.get('ollamaModel', 'llama3'),
    ollamaUrl: settingsStore.get('ollamaUrl', 'http://localhost:11434')
  }))

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    const parsedKey = settingKeySchema.parse(key)
    const currentSettings = settingsSchema.parse({
      llmProvider: settingsStore.get('llmProvider', 'claude'),
      apiKey: settingsStore.get('apiKey', ''),
      ollamaModel: settingsStore.get('ollamaModel', 'llama3'),
      ollamaUrl: settingsStore.get('ollamaUrl', 'http://localhost:11434')
    })

    const nextSettings = settingsSchema.parse({
      ...currentSettings,
      [parsedKey]: value
    })

    settingsStore.set(parsedKey, nextSettings[parsedKey])
  })
}
