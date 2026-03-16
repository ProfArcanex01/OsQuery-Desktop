import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import { EventEmitter } from 'events'
import { join } from 'path'
import { existsSync } from 'fs'

export interface QueryResult {
  rows: Record<string, string>[]
  error?: string
  executionTimeMs: number
}

export const osqueryEvents = new EventEmitter()

export class OsqueryManager {
  private proc: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private ready = false
  private pendingResolvers: Array<{
    resolve: (v: QueryResult) => void
    reject: (e: Error) => void
    startTime: number
    settled: boolean
  }> = []

  /** Resolve path to bundled osqueryi binary */
  private getBinaryPath(): string {
    const platform = process.platform
    const ext = platform === 'win32' ? '.exe' : ''
    const binaryName = `osqueryi${ext}`

    // In production: bundled in extraResources
    const resourcePath = join(process.resourcesPath, 'osquery', binaryName)
    if (existsSync(resourcePath)) return resourcePath

    // In dev: look for system install
    const systemPaths: Record<string, string> = {
      darwin: '/usr/local/bin/osqueryi',
      linux: '/usr/bin/osqueryi',
      win32: 'C:\\Program Files\\osquery\\osqueryi.exe'
    }
    const systemPath = systemPaths[platform]
    if (systemPath && existsSync(systemPath)) return systemPath

    // Fallback: assume it's on PATH
    return binaryName
  }

  async init(): Promise<void> {
    const binaryPath = this.getBinaryPath()
    console.log(`[osquery] Starting: ${binaryPath}`)

    this.proc = spawn(binaryPath, ['--json'], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.proc.stdout.on('data', (chunk: Buffer) => this.handleData(chunk.toString()))
    this.proc.stderr.on('data', (chunk: Buffer) => this.handleStderr(chunk.toString()))
    this.proc.on('error', (err) => {
      console.error('[osquery] Process error:', err)
      this.flushPending(err)
    })
    this.proc.on('exit', (code) => {
      console.warn(`[osquery] Exited with code ${code}`)
      this.ready = false
    })

    // osqueryi often stays silent when attached to pipes. Treat a process that
    // survives a short grace period as ready, since queries themselves still
    // return JSON over stdout in this mode.
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (err?: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        clearTimeout(gracePeriod)
        this.proc!.off('error', onError)
        this.proc!.off('exit', onExit)
        if (err) {
          reject(err)
          return
        }
        this.ready = true
        resolve()
      }
      const onError = (err: Error): void => finish(err)
      const onExit = (code: number | null): void => {
        finish(new Error(`osquery exited during startup${code === null ? '' : ` (code ${code})`}`))
      }
      const timeout = setTimeout(() => finish(new Error('osquery startup timeout')), 10_000)
      const gracePeriod = setTimeout(() => {
        console.log('[osquery] Ready for piped queries')
        finish()
      }, 500)

      this.proc!.once('error', onError)
      this.proc!.once('exit', onExit)
      this.proc!.stdout.once('data', () => {
        console.log('[osquery] Received initial stdout')
        finish()
      })
      this.proc!.stderr.once('data', () => {
        console.log('[osquery] Received initial stderr')
        finish()
      })
    })
  }

  private handleData(chunk: string): void {
    this.buffer += chunk
    this.buffer = this.buffer.replace(/^osquery>\s*/g, '')

    const pendingError = this.pendingResolvers[0]
    if (pendingError && pendingError.settled) {
      const promptIndex = this.buffer.lastIndexOf('osquery>')
      if (promptIndex !== -1) {
        this.buffer = this.buffer.slice(promptIndex + 'osquery>'.length)
      }
      return
    }

    // osqueryi returns one JSON array per query, terminated by newline after ]
    const match = this.buffer.match(/([\s\S]*?\])\s*\n?osquery>/)
    if (match || this.buffer.trimEnd().endsWith(']')) {
      const jsonStr = match ? match[1] : this.buffer.trim()
      this.buffer = match ? this.buffer.slice(match[0].length) : ''

      const resolver = this.pendingResolvers.shift()
      if (!resolver) return
      if (resolver.settled) return

      try {
        const rows = JSON.parse(jsonStr)
        resolver.settled = true
        resolver.resolve({
          rows,
          executionTimeMs: Date.now() - resolver.startTime
        })
      } catch (e) {
        resolver.reject(new Error(`JSON parse error: ${e}`))
      }
    }
  }

  private handleStderr(chunk: string): void {
    const message = chunk.toString().trim()
    if (!message) return

    console.log('[osquery stderr]', message)

    // Emit all stderr messages so the UI can render them in a console view.
    osqueryEvents.emit('stderr', message)

    const resolver = this.pendingResolvers[0]
    if (!resolver || resolver.settled) return

    // Surface SQLite and osquery CLI errors to the renderer instead of only logging them.
    resolver.settled = true
    this.pendingResolvers.shift()
    resolver.resolve({
      rows: [],
      error: message,
      executionTimeMs: Date.now() - resolver.startTime
    })
  }

  private flushPending(err: Error): void {
    while (this.pendingResolvers.length) {
      this.pendingResolvers.shift()!.reject(err)
    }
  }

  async runQuery(sql: string): Promise<QueryResult> {
    if (!this.proc || !this.ready) {
      throw new Error('osquery is not running')
    }
    return new Promise((resolve, reject) => {
      this.pendingResolvers.push({ resolve, reject, startTime: Date.now(), settled: false })
      this.proc!.stdin.write(sql.trim() + ';\n')
    })
  }

  shutdown(): void {
    if (this.proc) {
      this.proc.stdin.write('.exit\n')
      setTimeout(() => this.proc?.kill(), 1000)
    }
  }
}
