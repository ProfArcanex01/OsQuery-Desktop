import { useState, useEffect } from 'react'

interface SettingsState {
  llmProvider: string
  apiKey: string
  ollamaModel: string
  ollamaUrl: string
}

export function Settings(): JSX.Element {
  const [settings, setSettings] = useState<SettingsState>({
    llmProvider: 'claude',
    apiKey: '',
    ollamaModel: 'llama3',
    ollamaUrl: 'http://localhost:11434'
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getSettings().then((s) => setSettings(s as SettingsState))
  }, [])

  const handleChange = (key: keyof SettingsState, value: string): void => {
    setSettings((s) => ({ ...s, [key]: value }))
  }

  const handleSave = async (): Promise<void> => {
    await Promise.all(
      Object.entries(settings).map(([k, v]) => window.api.setSetting(k, v))
    )
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const providers = [
    { id: 'claude', label: 'Claude (Anthropic)', desc: 'Best quality NL→SQL' },
    { id: 'openai', label: 'GPT-4o (OpenAI)', desc: 'Strong alternative' },
    { id: 'ollama', label: 'Ollama (local)', desc: 'Private, offline, no API key needed' }
  ]

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-lg">
        <h2 className="text-base font-semibold text-slate-200 mb-4">Settings</h2>

        {/* LLM Provider */}
        <section className="mb-6">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            LLM Provider
          </label>
          <div className="flex flex-col gap-2">
            {providers.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  settings.llmProvider === p.id
                    ? 'border-violet-500/60 bg-violet-900/20'
                    : 'border-[#1e293b] bg-[#151b28] hover:border-slate-600'
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.id}
                  checked={settings.llmProvider === p.id}
                  onChange={() => handleChange('llmProvider', p.id)}
                  className="accent-violet-500"
                />
                <div>
                  <p className="text-sm text-slate-200">{p.label}</p>
                  <p className="text-xs text-slate-500">{p.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* API Key */}
        {settings.llmProvider !== 'ollama' && (
          <section className="mb-6">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              API Key
            </label>
            <input
              type="password"
              className="w-full bg-[#151b28] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500/60 font-mono selectable"
              placeholder={settings.llmProvider === 'claude' ? 'sk-ant-...' : 'sk-...'}
              value={settings.apiKey}
              onChange={(e) => handleChange('apiKey', e.target.value)}
            />
            <p className="text-xs text-slate-600 mt-1">Stored locally, never sent to any server other than the LLM provider.</p>
          </section>
        )}

        {/* Ollama settings */}
        {settings.llmProvider === 'ollama' && (
          <section className="mb-6 flex flex-col gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Ollama URL
              </label>
              <input
                className="w-full bg-[#151b28] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-500/60 font-mono selectable"
                value={settings.ollamaUrl}
                onChange={(e) => handleChange('ollamaUrl', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Model
              </label>
              <input
                className="w-full bg-[#151b28] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-500/60 font-mono selectable"
                placeholder="llama3, codellama, mistral…"
                value={settings.ollamaModel}
                onChange={(e) => handleChange('ollamaModel', e.target.value)}
              />
            </div>
          </section>
        )}

        <button
          onClick={handleSave}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            saved
              ? 'bg-emerald-700 text-emerald-200'
              : 'bg-violet-600 hover:bg-violet-500 text-white'
          }`}
        >
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
