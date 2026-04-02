import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc'
import { OsqueryManager, osqueryEvents } from './osquery'
import { HistoryStore } from './history'
import { SchemaCache } from './schema'
import { AgentService } from './agent'
import Store from 'electron-store'

let mainWindow: BrowserWindow | null = null
export const osqueryManager = new OsqueryManager()
export const historyStore = new HistoryStore()
export const schemaCache = new SchemaCache(osqueryManager)
export interface SystemHealth {
  osqueryReady: boolean
  schemaReady: boolean
  startupError: string | null
}

export const systemHealth: SystemHealth = {
  osqueryReady: false,
  schemaReady: false,
  startupError: null
}

export const settingsStore = new Store<{
  llmProvider: string
  apiKey: string
  ollamaModel: string
  ollamaUrl: string
}>()
export const agentService = new AgentService(osqueryManager, schemaCache, settingsStore)
const isDev = !app.isPackaged

function publishSystemHealth(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('system:health', { ...systemHealth })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1117',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { action: 'deny' }
    }

    if (!['https:', 'mailto:'].includes(parsed.protocol)) {
      return { action: 'deny' }
    }

    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    publishSystemHealth()
  })

  // Forward osquery stderr messages to the renderer so they can be shown in a console UI.
  osqueryEvents.on('stderr', (message: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.webContents.send('osquery:stderr', message)
  })
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.osquery.desktop')
  }

  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return

      if (!isDev && input.code === 'KeyR' && (input.control || input.meta)) {
        event.preventDefault()
      }

      if (isDev && input.code === 'F12') {
        if (window.webContents.isDevToolsOpened()) {
          window.webContents.closeDevTools()
        } else {
          window.webContents.openDevTools({ mode: 'detach' })
        }
      }
    })
  })

  historyStore.init()
  registerIpcHandlers()
  createWindow()

  try {
    // Initialise services after the window exists so startup failures can be shown in-app.
    await osqueryManager.init()
    systemHealth.osqueryReady = true

    const loadedTables = await schemaCache.init()
    systemHealth.schemaReady = loadedTables > 0
    systemHealth.startupError = null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    systemHealth.osqueryReady = false
    systemHealth.schemaReady = false
    systemHealth.startupError = `Failed to initialize osquery: ${message}`
  }
  publishSystemHealth()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  osqueryManager.shutdown()
  if (process.platform !== 'darwin') app.quit()
})
