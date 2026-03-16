# OsQuery Desktop

A cross-platform Electron desktop app for osquery investigation workflows.

It supports:
- natural-language to SQL generation
- direct SQL editing and execution
- query history and bookmarking
- visible error feedback in the UI
- an `Agent Mode` that can plan, ask for approval, execute forensic checks, attempt query recovery, and generate an investigation report

## Prerequisites

- Node.js 20+
- osquery installed on your system:
  - macOS: `brew install osquery`
  - Ubuntu: `apt install osquery`
  - Windows: download from https://osquery.io/downloads

## Getting Started

```bash
# Install dependencies
npm install

# Run in development
env -u ELECTRON_RUN_AS_NODE ESBUILD_BINARY_PATH="$PWD/node_modules/@esbuild/darwin-arm64/bin/esbuild" npm run dev

# Build for production
npm run build
npm run dist
```

Notes:
- The development command explicitly clears `ELECTRON_RUN_AS_NODE` because that environment variable prevents Electron from starting as a desktop app.
- The `ESBUILD_BINARY_PATH` override is used to ensure `esbuild` resolves correctly in this environment.

## Setting Up The LLM

1. Launch the app and click **Settings**
2. Choose your LLM provider:
   - **Claude**: get a key at https://console.anthropic.com
   - **OpenAI**: get a key at https://platform.openai.com
   - **Ollama**: local/offline option with no cloud API key
3. Enter your API key and click **Save**

If you use Ollama:

```bash
ollama pull llama3
ollama serve
```

## Usage

- Type a question in plain English and click **Generate SQL**
- Edit the generated SQL freely in the SQL editor
- Press `Cmd+Enter` or click **Run** to execute
- Use **Bookmark** to save an important query immediately
- Browse tables in the left sidebar and insert a starter `SELECT`
- Review prior queries in **History**
- Use the star in **History** to favorite a query
- Errors are shown directly in the query workflow instead of failing silently

## Agent Mode

`Agent Mode` is designed for guided investigations.

Workflow:
1. Enter a forensic or triage goal, for example: `The system may be compromised. Investigate it.`
2. The app generates a step-by-step read-only osquery investigation plan
3. Review the proposed plan and approve it
4. The app executes each step, attempts one SQL repair if a query fails, and records the output
5. Review the final report plus per-step output details

Example prompt:

```text
Perform a macOS-focused forensic investigation on this host. Check for suspicious launch agents and launch daemons, login items, cron jobs, unexpected processes, unusual parent-child process chains, recent user logins, active listening ports, suspicious outbound connections, SSH persistence, shell profile modifications, unauthorized keys, and recently modified sensitive files. Present a step-by-step investigation plan for approval before executing any queries, recover from query errors if needed, and finish with a concise incident report with findings, failed checks, and recommended next actions.
```

Notes:
- `Agent Mode` still depends on a configured LLM provider.
- Each executed step exposes its actual query output in the UI.
- The generated plan is read-only; it is intended for investigation, not remediation.

## Security Notes

- LLM API keys are stored locally in the app settings store.
- Query history and bookmarks are stored locally.
- The app runs read-only osquery SQL and is intended for investigation workflows.
- Do not commit local environment files, logs, or local database artifacts.

## Project Structure

```text
src/
  main/           Electron main process
    index.ts      App entry, window creation
    agent.ts      Investigation planning and execution orchestration
    osquery.ts    osquery subprocess manager
    schema.ts     Schema cache, table inference, and investigation context
    history.ts    Local query history and bookmarks
    ipc.ts        IPC handler registration
    llm/
      index.ts    LLM provider interface, NL SQL, planning, repair, and reporting
  preload/
    index.ts      contextBridge, typed window.api
  renderer/
    App.tsx       Root component, tab state, query workflow
    components/
      NLInput.tsx       Natural language question input
      SQLEditor.tsx     CodeMirror 6 SQL editor
      ResultsTable.tsx  TanStack Table results grid
      SchemaSidebar.tsx Table browser with column detail
      SummaryCard.tsx   LLM plain-English result summary
      QueryHistory.tsx  History list with favorites
      AgentMode.tsx     Plan approval, execution, and reporting UI
      Settings.tsx      LLM provider and key configuration
```
