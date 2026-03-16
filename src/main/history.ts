import Store from 'electron-store'

export interface HistoryEntry {
  id: number
  sql: string
  nlInput: string | null
  rowCount: number
  executionTimeMs: number
  savedAt: string
  isFavorite: boolean
}

interface StoreSchema {
  entries: HistoryEntry[]
  nextId: number
}

export class HistoryStore {
  private store!: Store<StoreSchema>

  init(): void {
    this.store = new Store<StoreSchema>({
      name: 'query-history',
      defaults: { entries: [], nextId: 1 }
    })
  }

  add(entry: Omit<HistoryEntry, 'id' | 'savedAt'>): number {
    const id = this.store.get('nextId')
    const newEntry: HistoryEntry = {
      ...entry,
      id,
      savedAt: new Date().toISOString()
    }
    const entries = this.store.get('entries')
    // Keep all favorites + last 499 non-favorites to cap file size
    const trimmed = [
      ...entries.filter((e) => e.isFavorite),
      ...entries.filter((e) => !e.isFavorite).slice(-499)
    ]
    this.store.set('entries', [newEntry, ...trimmed])
    this.store.set('nextId', id + 1)
    return id
  }

  // Bookmark the current query so it is retained and easy to revisit later.
  bookmark(sql: string, nlInput: string | null): number {
    const entries = this.store.get('entries')
    const existing = entries.find((entry) => entry.sql === sql && entry.nlInput === nlInput)

    if (existing) {
      const updated: HistoryEntry = {
        ...existing,
        isFavorite: true,
        savedAt: new Date().toISOString()
      }
      this.store.set('entries', [updated, ...entries.filter((entry) => entry.id !== existing.id)])
      return existing.id
    }

    return this.add({
      sql,
      nlInput,
      rowCount: 0,
      executionTimeMs: 0,
      isFavorite: true
    })
  }

  list(limit = 100): HistoryEntry[] {
    return this.store.get('entries').slice(0, limit)
  }

  toggleFavorite(id: number): void {
    const entries = this.store
      .get('entries')
      .map((e) => (e.id === id ? { ...e, isFavorite: !e.isFavorite } : e))
    this.store.set('entries', entries)
  }

  delete(id: number): void {
    this.store.set(
      'entries',
      this.store.get('entries').filter((e) => e.id !== id)
    )
  }

  clear(): void {
    // Keep favorites only
    this.store.set(
      'entries',
      this.store.get('entries').filter((e) => e.isFavorite)
    )
  }
}
