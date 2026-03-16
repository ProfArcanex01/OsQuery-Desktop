import { useState } from 'react'

interface InvestigationPlanStep {
  id: string
  title: string
  objective: string
  sql: string
  expectedSignal: string
}

interface InvestigationPlan {
  goal: string
  scope: string
  approvalNote: string
  steps: InvestigationPlanStep[]
}

interface InvestigationExecutionStep {
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

interface InvestigationExecution {
  plan: InvestigationPlan
  startedAt: string
  completedAt: string
  steps: InvestigationExecutionStep[]
  report: string
}

const PLACEHOLDERS = [
  'The system is compromised. Investigate it.',
  'Investigate suspicious persistence on this host.',
  'Review the host for unusual outbound network activity.',
  'Investigate possible credential access activity.'
]

export function AgentMode(): JSX.Element {
  const [goal, setGoal] = useState(PLACEHOLDERS[0])
  const [plan, setPlan] = useState<InvestigationPlan | null>(null)
  const [execution, setExecution] = useState<InvestigationExecution | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPlanning, setIsPlanning] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})

  const toggleStep = (stepId: string): void => {
    setExpandedSteps((current) => ({ ...current, [stepId]: !current[stepId] }))
  }

  const handlePlan = async (): Promise<void> => {
    if (!goal.trim()) return
    setIsPlanning(true)
    setError(null)
    setExecution(null)
    try {
      const nextPlan = await window.api.createAgentPlan(goal)
      setPlan(nextPlan as InvestigationPlan)
    } catch (err: any) {
      setError(err.message ?? 'Failed to generate investigation plan.')
    } finally {
      setIsPlanning(false)
    }
  }

  const handleExecute = async (): Promise<void> => {
    if (!plan) return
    setIsExecuting(true)
    setError(null)
    try {
      const result = await window.api.executeAgentPlan(plan)
      setExecution(result as InvestigationExecution)
    } catch (err: any) {
      setError(err.message ?? 'Failed to execute investigation plan.')
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 gap-4 overflow-y-auto">
      <div className="rounded-xl border border-[#1e293b] bg-[#151b28] p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Agent Mode</h2>
            <p className="mt-1 text-sm text-slate-400">
              Generate an investigation plan, approve it, execute the queries, and review the report.
            </p>
          </div>
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] uppercase tracking-wide text-cyan-200">
            Approval Required
          </span>
        </div>

        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder={PLACEHOLDERS[1]}
          className="mt-4 h-28 w-full resize-none rounded-lg border border-[#1e293b] bg-[#0f1117] px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500/50 selectable"
        />

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handlePlan}
            disabled={isPlanning || isExecuting || !goal.trim()}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isPlanning || isExecuting || !goal.trim()
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-cyan-600 text-white hover:bg-cyan-500'
            }`}
          >
            {isPlanning ? 'Planning…' : 'Generate Plan'}
          </button>
          {plan && (
            <button
              onClick={handleExecute}
              disabled={isExecuting}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                isExecuting
                  ? 'bg-emerald-900/40 text-emerald-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              {isExecuting ? 'Executing…' : 'Approve And Execute'}
            </button>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <div className="font-medium">Agent Error</div>
            <div className="mt-1 text-xs selectable break-words">{error}</div>
          </div>
        )}
      </div>

      {plan && (
        <div className="rounded-xl border border-[#1e293b] bg-[#151b28] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Proposed Plan</h3>
              <p className="mt-1 text-xs text-slate-400">{plan.approvalNote}</p>
            </div>
            <span className="text-xs text-slate-500">{plan.steps.length} steps</span>
          </div>

          <div className="mt-3 rounded-lg border border-[#1e293b] bg-[#0f1117] px-3 py-2 text-xs text-slate-300">
            <span className="text-slate-500">Scope:</span> {plan.scope}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {plan.steps.map((step, index) => (
              <div key={step.id} className="rounded-lg border border-[#1e293b] bg-[#0f1117] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Step {index + 1}</div>
                    <div className="mt-1 text-sm font-medium text-slate-100">{step.title}</div>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-300">{step.objective}</p>
                <p className="mt-2 text-xs text-cyan-200">{step.expectedSignal}</p>
                <pre className="mt-3 overflow-x-auto rounded-md bg-[#151b28] p-3 text-xs text-emerald-300 selectable">
                  {step.sql}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {execution && (
        <>
          <div className="rounded-xl border border-[#1e293b] bg-[#151b28] p-4">
            <h3 className="text-sm font-semibold text-slate-100">Execution Report</h3>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-[#0f1117] p-4 text-sm text-slate-200 selectable">
              {execution.report}
            </pre>
          </div>

          <div className="rounded-xl border border-[#1e293b] bg-[#151b28] p-4">
            <h3 className="text-sm font-semibold text-slate-100">Execution Details</h3>
            <div className="mt-4 flex flex-col gap-3">
              {execution.steps.map((step, index) => (
                <div key={step.id} className="rounded-lg border border-[#1e293b] bg-[#0f1117] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">Step {index + 1}</div>
                      <div className="mt-1 text-sm font-medium text-slate-100">{step.title}</div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wide ${
                        step.status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-red-500/15 text-red-300'
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{step.objective}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>{step.rowCount} rows</span>
                    <span>{step.executionTimeMs}ms</span>
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded-md bg-[#151b28] p-3 text-xs text-emerald-300 selectable">
                    {step.finalSql}
                  </pre>
                  {step.error && (
                    <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 selectable">
                      {step.error}
                    </div>
                  )}
                  {step.repairNotes.length > 0 && (
                    <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      {step.repairNotes.join(' ')}
                    </div>
                  )}
                  <div className="mt-3">
                    <button
                      onClick={() => toggleStep(step.id)}
                      className="rounded-md border border-[#334155] bg-[#151b28] px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
                    >
                      {expandedSteps[step.id] ? 'Hide Output' : 'Show Output'}
                    </button>
                  </div>
                  {expandedSteps[step.id] && (
                    <div className="mt-3 rounded-md border border-[#1e293b] bg-[#151b28] p-3">
                      {step.rows.length === 0 ? (
                        <div className="text-xs text-slate-500">
                          {step.status === 'completed'
                            ? 'This step completed but returned no rows.'
                            : 'No output was captured for this failed step.'}
                        </div>
                      ) : (
                        <>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr>
                                  {Object.keys(step.rows[0]).map((key) => (
                                    <th
                                      key={key}
                                      className="border-b border-[#1e293b] px-2 py-2 text-left font-medium text-slate-500 whitespace-nowrap"
                                    >
                                      {key}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {step.rows.slice(0, 10).map((row, rowIndex) => (
                                  <tr
                                    key={`${step.id}-${rowIndex}`}
                                    className={rowIndex % 2 === 0 ? 'bg-transparent' : 'bg-[#0f1117]/40'}
                                  >
                                    {Object.entries(row).map(([key, value]) => (
                                      <td
                                        key={`${step.id}-${rowIndex}-${key}`}
                                        className="max-w-xs truncate border-b border-[#1e293b]/50 px-2 py-1.5 text-slate-300 selectable"
                                        title={String(value)}
                                      >
                                        {String(value)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {step.rows.length > 10 && (
                            <div className="mt-2 text-xs text-slate-500">
                              Showing first 10 of {step.rows.length} rows.
                            </div>
                          )}
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-200">
                              Raw JSON Output
                            </summary>
                            <pre className="mt-2 overflow-x-auto rounded-md bg-[#0f1117] p-3 text-xs text-slate-300 selectable">
                              {JSON.stringify(step.rows, null, 2)}
                            </pre>
                          </details>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
