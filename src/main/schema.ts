import { OsqueryManager } from './osquery'

export interface ColumnDef {
  name: string
  type: string
  description: string
}

export interface TableDef {
  name: string
  columns: ColumnDef[]
}

const INVESTIGATION_PRIORITY_TABLES = [
  'processes',
  'process_open_sockets',
  'listening_ports',
  'logged_in_users',
  'last',
  'users',
  'groups',
  'sudoers',
  'crontab',
  'launchd',
  'startup_items',
  'system_info',
  'osquery_info',
  'process_envs',
  'process_open_files',
  'hash',
  'file',
  'kernel_modules',
  'authorized_keys',
  'routes'
]

export class SchemaCache {
  private tables: Map<string, TableDef> = new Map()
  private osquery: OsqueryManager

  constructor(osquery: OsqueryManager) {
    this.osquery = osquery
  }

  async init(): Promise<void> {
    try {
      // Fetch all table names
      const tableResult = await this.osquery.runQuery(
        'SELECT name FROM osquery_registry WHERE registry = "table" AND internal = 0 AND active = 1'
      )
      const tableNames = tableResult.rows.map((r) => r.name)

      // Fetch column info for all tables at once via osquery_info
      for (const tableName of tableNames) {
        try {
          const colResult = await this.osquery.runQuery(
            `SELECT name, type FROM pragma_table_info("${tableName}")`
          )
          this.tables.set(tableName, {
            name: tableName,
            columns: colResult.rows.map((r) => ({
              name: r.name,
              type: r.type || 'TEXT',
              description: ''
            }))
          })
        } catch {
          // Skip tables that fail
        }
      }

      console.log(`[schema] Loaded ${this.tables.size} tables`)
    } catch (err) {
      console.error('[schema] Failed to load schema:', err)
    }
  }

  getAllTableNames(): string[] {
    return Array.from(this.tables.keys()).sort()
  }

  getTable(name: string): TableDef | undefined {
    return this.tables.get(name)
  }

  getStructuredSchema(tableNames: string[]): string {
    return tableNames
      .map((name) => {
        const table = this.tables.get(name)
        if (!table) return ''
        const cols = table.columns.map((column) => `- ${column.name}: ${column.type}`).join('\n')
        return `${table.name}\n${cols}`
      })
      .filter(Boolean)
      .join('\n\n')
  }

  /** Return schema context string for a set of table names (for LLM prompts) */
  getSchemaContext(tableNames: string[]): string {
    return tableNames
      .map((name) => {
        const t = this.tables.get(name)
        if (!t) return ''
        const cols = t.columns.map((c) => `  ${c.name} ${c.type}`).join(',\n')
        return `CREATE TABLE ${t.name} (\n${cols}\n);`
      })
      .filter(Boolean)
      .join('\n\n')
  }

  /**
   * Heuristic: find tables likely relevant to a natural-language question
   * by checking if any table name or column name appears in the question.
   */
  inferRelevantTables(question: string, maxTables = 5): string[] {
    const lower = question.toLowerCase()
    const scored: Array<{ name: string; score: number }> = []

    for (const [name, table] of this.tables.entries()) {
      let score = 0
      if (lower.includes(name.replace(/_/g, ' '))) score += 10
      if (lower.includes(name)) score += 8
      for (const col of table.columns) {
        if (lower.includes(col.name.replace(/_/g, ' '))) score += 3
        if (lower.includes(col.name)) score += 2
      }
      if (score > 0) scored.push({ name, score })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, maxTables).map((s) => s.name)
  }

  getInvestigationTables(question: string, maxTables = 14): string[] {
    const inferred = this.inferRelevantTables(question, maxTables)
    const merged = new Set<string>(inferred)

    for (const table of INVESTIGATION_PRIORITY_TABLES) {
      if (merged.size >= maxTables) break
      if (this.tables.has(table)) merged.add(table)
    }

    return Array.from(merged).slice(0, maxTables)
  }

  getInvestigationSchemaContext(question: string): string {
    return this.getStructuredSchema(this.getInvestigationTables(question))
  }
}
