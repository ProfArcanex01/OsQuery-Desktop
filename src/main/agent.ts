import Store from 'electron-store'
import { z } from 'zod'
import { createLLMProvider } from './llm'
import { OsqueryManager, QueryResult } from './osquery'
import { SchemaCache } from './schema'

export interface InvestigationPlanStep {
  id: string
  title: string
  objective: string
  sql: string
  expectedSignal: string
}

export interface InvestigationPlan {
  goal: string
  scope: string
  approvalNote: string
  steps: InvestigationPlanStep[]
}

export interface InvestigationExecutionStep {
  id: string
  title: string
  objective: string
  sql: string
  finalSql: string
  expectedSignal: string
  status: 'completed' | 'failed'
  rows: Record<string, string>[]
  rowCount: number
  executionTimeMs: number
  error: string | null
  repairNotes: string[]
}

export interface InvestigationExecution {
  plan: InvestigationPlan
  startedAt: string
  completedAt: string
  steps: InvestigationExecutionStep[]
  report: string
}

const investigationPlanSchema: z.ZodType<InvestigationPlan> = z.object({
  goal: z.string().trim().min(1).max(20_000),
  scope: z.string().trim().min(1).max(20_000),
  approvalNote: z.string().trim().min(1).max(20_000),
  steps: z.array(
    z.object({
      id: z.string().trim().min(1).max(200),
      title: z.string().trim().min(1).max(500),
      objective: z.string().trim().min(1).max(5_000),
      sql: z.string().trim().min(1).max(50_000),
      expectedSignal: z.string().trim().min(1).max(5_000)
    })
  ).min(1).max(10)
})

export class AgentService {
  constructor(
    private osqueryManager: OsqueryManager,
    private schemaCache: SchemaCache,
    private store: Store<any>
  ) {}

  // Build a proposed investigation plan that the user can approve before any execution.
  async createPlan(goal: string): Promise<InvestigationPlan> {
    const provider = createLLMProvider(this.store)
    const schemaContext = this.schemaCache.getInvestigationSchemaContext(goal)
    return investigationPlanSchema.parse(await provider.planInvestigation(goal, schemaContext))
  }

  // Execute the approved plan step by step, attempting a single SQL repair when a step fails.
  async executePlan(plan: InvestigationPlan): Promise<InvestigationExecution> {
    const parsedPlan = investigationPlanSchema.parse(plan)
    const provider = createLLMProvider(this.store)
    const startedAt = new Date().toISOString()
    const steps: InvestigationExecutionStep[] = []

    for (const step of parsedPlan.steps) {
      let result: QueryResult | null = null
      let finalSql = step.sql
      let error: string | null = null
      const repairNotes: string[] = []

      try {
        result = await this.osqueryManager.runQuery(finalSql)
        if (result.error) {
          error = result.error
          result = null
        }
      } catch (err: any) {
        error = err.message ?? String(err)
      }

      if (!result && error) {
        try {
          const repaired = await provider.repairInvestigationSQL({
            goal: parsedPlan.goal,
            stepTitle: step.title,
            stepObjective: step.objective,
            sql: finalSql,
            error,
            schemaContext: this.schemaCache.getInvestigationSchemaContext(
              `${parsedPlan.goal}\n${step.title}\n${step.objective}`
            )
          })

          if (repaired.sql.trim() && repaired.sql.trim() !== finalSql.trim()) {
            finalSql = repaired.sql
            repairNotes.push(repaired.reason)
            result = await this.osqueryManager.runQuery(finalSql)
            if (result.error) {
              error = result.error
              result = null
            } else {
              error = null
            }
          }
        } catch (repairErr: any) {
          repairNotes.push(repairErr.message ?? String(repairErr))
        }
      }

      steps.push({
        id: step.id,
        title: step.title,
        objective: step.objective,
        sql: step.sql,
        finalSql,
        expectedSignal: step.expectedSignal,
        status: result ? 'completed' : 'failed',
        rows: result?.rows ?? [],
        rowCount: result?.rows.length ?? 0,
        executionTimeMs: result?.executionTimeMs ?? 0,
        error,
        repairNotes
      })
    }

    const completedAt = new Date().toISOString()
    const report = await provider.generateInvestigationReport({
      goal: parsedPlan.goal,
      scope: parsedPlan.scope,
      startedAt,
      completedAt,
      steps
    })

    return {
      plan: parsedPlan,
      startedAt,
      completedAt,
      steps,
      report
    }
  }
}
