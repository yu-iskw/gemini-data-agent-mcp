/** Agent Platform evaluation adapter boundary for agentops-mcp. */

export interface OfflineEvalCase {
  id: string;
  input: string;
  expectedOutput?: string;
  metadata?: Record<string, unknown>;
}

export interface OfflineEvalRunInput {
  dataAgent: string;
  cases: OfflineEvalCase[];
}

export interface OfflineEvalRunResult {
  runId: string;
  status: 'pending' | 'completed' | 'failed';
  message?: string;
}

export interface EvaluationClient {
  runOfflineEvaluation(input: OfflineEvalRunInput): Promise<OfflineEvalRunResult>;
}

export function createEvaluationClientStub(): EvaluationClient {
  return {
    async runOfflineEvaluation(input: OfflineEvalRunInput): Promise<OfflineEvalRunResult> {
      return {
        runId: `stub-${Date.now()}`,
        status: 'pending',
        message: `Offline evaluation queued for ${input.cases.length} case(s) against ${input.dataAgent}`,
      };
    },
  };
}

export function validateOfflineEvalCases(cases: OfflineEvalCase[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (cases.length === 0) {
    errors.push('At least one evaluation case is required.');
  }
  for (const [index, evalCase] of cases.entries()) {
    if (!evalCase.id?.trim()) {
      errors.push(`Case ${index}: id is required.`);
    }
    if (!evalCase.input?.trim()) {
      errors.push(`Case ${index}: input is required.`);
    }
  }
  return { valid: errors.length === 0, errors };
}
