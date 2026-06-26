import { describe, expect, it } from 'vitest';

import { createEvaluationClientStub, validateOfflineEvalCases } from '../evaluation-client.js';

describe('validateOfflineEvalCases', () => {
  it('requires at least one case', () => {
    const result = validateOfflineEvalCases([]);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one evaluation case is required.');
  });

  it('requires non-empty id and input per case', () => {
    const result = validateOfflineEvalCases([
      { id: '  ', input: '  ' },
      { id: 'case-2', input: '' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Case 0: id is required.',
      'Case 0: input is required.',
      'Case 1: input is required.',
    ]);
  });

  it('accepts valid cases', () => {
    const result = validateOfflineEvalCases([
      { id: 'case-1', input: 'What is revenue?', expectedOutput: '100' },
    ]);
    expect(result).toEqual({ valid: true, errors: [] });
  });
});

describe('createEvaluationClientStub', () => {
  it('queues offline evaluation runs', async () => {
    const client = createEvaluationClientStub();
    const result = await client.runOfflineEvaluation({
      dataAgent: 'projects/p/locations/global/dataAgents/a1',
      cases: [{ id: 'c1', input: 'prompt' }],
    });

    expect(result.status).toBe('pending');
    expect(result.runId).toMatch(/^stub-/);
    expect(result.message).toContain('1 case(s)');
    expect(result.message).toContain('projects/p/locations/global/dataAgents/a1');
  });
});
