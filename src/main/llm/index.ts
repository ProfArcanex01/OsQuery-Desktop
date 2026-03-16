import Store from 'electron-store'
import type { InvestigationExecutionStep, InvestigationPlan } from '../agent'

export interface LLMProvider {
  translateToSQL(question: string, schemaContext: string): Promise<string>
  summarizeResults(
    question: string,
    sql: string,
    rows: Record<string, string>[]
  ): Promise<string>
  planInvestigation(goal: string, schemaContext: string): Promise<InvestigationPlan>
  repairInvestigationSQL(input: {
    goal: string
    stepTitle: string
    stepObjective: string
    sql: string
    error: string
    schemaContext: string
  }): Promise<{ sql: string; reason: string }>
  generateInvestigationReport(input: {
    goal: string
    scope: string
    startedAt: string
    completedAt: string
    steps: InvestigationExecutionStep[]
  }): Promise<string>
}

const TRANSLATE_SYSTEM = `You are an osquery SQL expert. The user will ask a question in plain English.
You will be given the CREATE TABLE schemas for the most relevant osquery tables.
Respond with ONLY a valid osquery SQL query — no explanation, no markdown fences, no commentary.
Use JOINs when needed. Prefer specific column names over SELECT *.`

const SUMMARIZE_SYSTEM = `You are a security analyst assistant. Given an osquery SQL query, its results, and the original question,
write a concise plain-English summary (2–4 sentences) of what the results show.
Be specific — mention notable values, counts, or anomalies. Do not repeat the SQL.`

const PLAN_SYSTEM = `You are an incident response planner for osquery investigations.
Build a cautious investigation plan for the user goal. Return strict JSON only with this shape:
{
  "goal": "string",
  "scope": "string",
  "approvalNote": "string",
  "steps": [
    {
      "id": "step-1",
      "title": "string",
      "objective": "string",
      "sql": "SELECT ...;",
      "expectedSignal": "string"
    }
  ]
}
Rules:
- Use 3 to 6 steps.
- Queries must be read-only osquery SQL.
- Prefer host-wide forensic tables before niche tables unless the goal requires niche scope.
- Do not include markdown fences or commentary outside JSON.`

const REPAIR_SYSTEM = `You repair failing osquery SQL queries.
Return strict JSON only with this shape:
{
  "sql": "SELECT ...;",
  "reason": "short explanation"
}
Rules:
- Keep the query read-only.
- Use only tables and columns present in the provided schema context.
- Fix the specific error without changing the step objective.`

const REPORT_SYSTEM = `You are a security analyst writing an investigation report.
Produce a concise but useful report with:
- Executive summary
- Findings
- Failed or recovered steps
- Recommended next actions
Do not invent evidence that is not present in the execution data.`

function requireApiKey(providerLabel: string, apiKey: string): void {
  if (!apiKey.trim()) {
    throw new Error(
      `${providerLabel} is selected but no API key is configured. Open Settings and add an API key, or switch to Ollama for local use.`
    )
  }
}

function extractJsonBlock<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error('The model returned an invalid response format.')
  }
  return JSON.parse(match[0]) as T
}

export function createLLMProvider(store: Store<any>): LLMProvider {
  const providerName = store.get('llmProvider', 'claude') as string

  switch (providerName) {
    case 'openai':
      return new OpenAIProvider(store.get('apiKey', '') as string)
    case 'ollama':
      return new OllamaProvider(
        store.get('ollamaUrl', 'http://localhost:11434') as string,
        store.get('ollamaModel', 'llama3') as string
      )
    case 'claude':
    default:
      return new ClaudeProvider(store.get('apiKey', '') as string)
  }
}

// ── Claude ──────────────────────────────────────────────────────────────────

class ClaudeProvider implements LLMProvider {
  constructor(private apiKey: string) {}

  private async call(system: string, user: string): Promise<string> {
    requireApiKey('Claude', this.apiKey)
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: this.apiKey })
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }]
    })
    return (msg.content[0] as { text: string }).text.trim()
  }

  async translateToSQL(question: string, schemaContext: string): Promise<string> {
    return this.call(
      TRANSLATE_SYSTEM,
      `Relevant table schemas:\n\n${schemaContext}\n\nQuestion: ${question}`
    )
  }

  async summarizeResults(
    question: string,
    sql: string,
    rows: Record<string, string>[]
  ): Promise<string> {
    const preview = JSON.stringify(rows.slice(0, 20), null, 2)
    return this.call(
      SUMMARIZE_SYSTEM,
      `Original question: ${question}\nSQL: ${sql}\nResults (first 20 rows):\n${preview}`
    )
  }

  async planInvestigation(goal: string, schemaContext: string): Promise<InvestigationPlan> {
    const response = await this.call(
      PLAN_SYSTEM,
      `Goal: ${goal}\n\nAvailable schema:\n${schemaContext}`
    )
    return extractJsonBlock<InvestigationPlan>(response)
  }

  async repairInvestigationSQL(input: {
    goal: string
    stepTitle: string
    stepObjective: string
    sql: string
    error: string
    schemaContext: string
  }): Promise<{ sql: string; reason: string }> {
    const response = await this.call(
      REPAIR_SYSTEM,
      `Goal: ${input.goal}
Step title: ${input.stepTitle}
Step objective: ${input.stepObjective}
Failed SQL: ${input.sql}
Error: ${input.error}

Available schema:
${input.schemaContext}`
    )
    return extractJsonBlock<{ sql: string; reason: string }>(response)
  }

  async generateInvestigationReport(input: {
    goal: string
    scope: string
    startedAt: string
    completedAt: string
    steps: InvestigationExecutionStep[]
  }): Promise<string> {
    return this.call(
      REPORT_SYSTEM,
      JSON.stringify(input, null, 2)
    )
  }
}

// ── OpenAI ──────────────────────────────────────────────────────────────────

class OpenAIProvider implements LLMProvider {
  constructor(private apiKey: string) {}

  private async call(system: string, user: string): Promise<string> {
    requireApiKey('OpenAI', this.apiKey)
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: this.apiKey })
    const res = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
    return res.choices[0].message.content?.trim() ?? ''
  }

  async translateToSQL(question: string, schemaContext: string): Promise<string> {
    return this.call(
      TRANSLATE_SYSTEM,
      `Relevant table schemas:\n\n${schemaContext}\n\nQuestion: ${question}`
    )
  }

  async summarizeResults(
    question: string,
    sql: string,
    rows: Record<string, string>[]
  ): Promise<string> {
    const preview = JSON.stringify(rows.slice(0, 20), null, 2)
    return this.call(
      SUMMARIZE_SYSTEM,
      `Original question: ${question}\nSQL: ${sql}\nResults:\n${preview}`
    )
  }

  async planInvestigation(goal: string, schemaContext: string): Promise<InvestigationPlan> {
    const response = await this.call(
      PLAN_SYSTEM,
      `Goal: ${goal}\n\nAvailable schema:\n${schemaContext}`
    )
    return extractJsonBlock<InvestigationPlan>(response)
  }

  async repairInvestigationSQL(input: {
    goal: string
    stepTitle: string
    stepObjective: string
    sql: string
    error: string
    schemaContext: string
  }): Promise<{ sql: string; reason: string }> {
    const response = await this.call(
      REPAIR_SYSTEM,
      `Goal: ${input.goal}
Step title: ${input.stepTitle}
Step objective: ${input.stepObjective}
Failed SQL: ${input.sql}
Error: ${input.error}

Available schema:
${input.schemaContext}`
    )
    return extractJsonBlock<{ sql: string; reason: string }>(response)
  }

  async generateInvestigationReport(input: {
    goal: string
    scope: string
    startedAt: string
    completedAt: string
    steps: InvestigationExecutionStep[]
  }): Promise<string> {
    return this.call(
      REPORT_SYSTEM,
      JSON.stringify(input, null, 2)
    )
  }
}

// ── Ollama (local) ───────────────────────────────────────────────────────────

class OllamaProvider implements LLMProvider {
  constructor(
    private baseUrl: string,
    private model: string
  ) {}

  private async call(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    })
    if (!res.ok) {
      throw new Error(
        `Ollama request failed (${res.status}). Check that Ollama is running at ${this.baseUrl} and that the model "${this.model}" is available.`
      )
    }
    const json = (await res.json()) as { message: { content: string } }
    return json.message.content.trim()
  }

  async translateToSQL(question: string, schemaContext: string): Promise<string> {
    return this.call(
      TRANSLATE_SYSTEM,
      `Relevant table schemas:\n\n${schemaContext}\n\nQuestion: ${question}`
    )
  }

  async summarizeResults(
    question: string,
    sql: string,
    rows: Record<string, string>[]
  ): Promise<string> {
    const preview = JSON.stringify(rows.slice(0, 10), null, 2)
    return this.call(
      SUMMARIZE_SYSTEM,
      `Original question: ${question}\nSQL: ${sql}\nResults:\n${preview}`
    )
  }

  async planInvestigation(goal: string, schemaContext: string): Promise<InvestigationPlan> {
    const response = await this.call(
      PLAN_SYSTEM,
      `Goal: ${goal}\n\nAvailable schema:\n${schemaContext}`
    )
    return extractJsonBlock<InvestigationPlan>(response)
  }

  async repairInvestigationSQL(input: {
    goal: string
    stepTitle: string
    stepObjective: string
    sql: string
    error: string
    schemaContext: string
  }): Promise<{ sql: string; reason: string }> {
    const response = await this.call(
      REPAIR_SYSTEM,
      `Goal: ${input.goal}
Step title: ${input.stepTitle}
Step objective: ${input.stepObjective}
Failed SQL: ${input.sql}
Error: ${input.error}

Available schema:
${input.schemaContext}`
    )
    return extractJsonBlock<{ sql: string; reason: string }>(response)
  }

  async generateInvestigationReport(input: {
    goal: string
    scope: string
    startedAt: string
    completedAt: string
    steps: InvestigationExecutionStep[]
  }): Promise<string> {
    return this.call(
      REPORT_SYSTEM,
      JSON.stringify(input, null, 2)
    )
  }
}
