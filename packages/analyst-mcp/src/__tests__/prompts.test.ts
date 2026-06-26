import { describe, it, expect } from 'vitest';

type PromptCallback = (args: Record<string, unknown>) => {
  messages: Array<{ content: { text: string } }>;
};
type PromptRegistry = Record<string, { callback: PromptCallback } | undefined>;

async function getPromptRegistry() {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { registerPrompts } = await import('../mcp/prompts.js');
  const server = new McpServer({ name: 'test', version: '0.1.0' });
  registerPrompts(server);
  return (server as unknown as { _registeredPrompts: PromptRegistry })._registeredPrompts;
}

function requirePrompt(prompts: PromptRegistry, name: string): { callback: PromptCallback } {
  const prompt = Object.entries(prompts).find(([promptName]) => promptName === name)?.[1];
  expect(prompt).toBeDefined();
  return prompt as { callback: PromptCallback };
}

describe('Prompt templates', () => {
  it('switch_intent prompt includes current and target intents', async () => {
    const prompts = await getPromptRegistry();
    const prompt = requirePrompt(prompts, 'gda.prompt.switch_intent');

    const result = prompt.callback({
      current_intent: 'explore',
      target_intent: 'report',
      constraints: 'keep context brief',
    });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('explore');
    expect(text).toContain('report');
    expect(text).toContain('keep context brief');
  });

  it('fork_session prompt includes branch goal', async () => {
    const prompts = await getPromptRegistry();
    const prompt = requirePrompt(prompts, 'gda.prompt.fork_session');

    const result = prompt.callback({
      session_id: 'sess_1',
      branch_goal: 'investigate anomaly',
      branch_name_hint: 'anomaly-branch',
    });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('sess_1');
    expect(text).toContain('investigate anomaly');
    expect(text).toContain('anomaly-branch');
  });

  it('resume_session prompt includes revision', async () => {
    const prompts = await getPromptRegistry();
    const prompt = requirePrompt(prompts, 'gda.prompt.resume_session');

    const result = prompt.callback({
      session_id: 'sess_2',
      latest_intent: 'debug',
      latest_revision: 8,
    });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('sess_2');
    expect(text).toContain('debug');
    expect(text).toContain('revision 8');
  });

  it('handoff_summary prompt includes payload', async () => {
    const prompts = await getPromptRegistry();
    const prompt = requirePrompt(prompts, 'gda.prompt.handoff_summary');

    const result = prompt.callback({
      session_id: 'sess_3',
      handoff_payload: '{"a":1}',
    });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('sess_3');
    expect(text).toContain('{"a":1}');
  });

  it('analyze_data_question template includes agent and question in output', async () => {
    const prompts = await getPromptRegistry();
    const prompt = requirePrompt(prompts, 'gda.prompt.analyze_data_question');

    const result = prompt.callback({ agent: 'sales-prod', question: 'Why did revenue drop?' });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('sales-prod');
    expect(text).toContain('Why did revenue drop?');
  });

  it('compare_segments prompt includes all required fields', async () => {
    const prompts = await getPromptRegistry();
    const prompt = requirePrompt(prompts, 'gda.prompt.compare_segments');

    const result = prompt.callback({
      agent: 'sales-prod',
      segment_a: 'North America',
      segment_b: 'Europe',
      metric: 'revenue',
      time_period: 'Q1 2026',
    });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('North America');
    expect(text).toContain('Europe');
    expect(text).toContain('revenue');
    expect(text).toContain('Q1 2026');
  });

  it('investigate_data_issue template includes agent and issue', async () => {
    const prompts = await getPromptRegistry();
    const prompt = requirePrompt(prompts, 'gda.prompt.investigate_data_issue');

    const result = prompt.callback({ agent: 'finance', issue: 'margin dropped 10%' });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('finance');
    expect(text).toContain('margin dropped 10%');
  });

  it('find_anomalies prompt includes metric and dimensions', async () => {
    const prompts = await getPromptRegistry();
    const prompt = requirePrompt(prompts, 'gda.prompt.find_anomalies');

    const result = prompt.callback({
      agent: 'sales',
      metric: 'revenue',
      time_period: 'last_week',
      dimensions: 'region, product',
    });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('revenue');
    expect(text).toContain('region, product');
  });

  it('explain_generated_query prompt includes response text', async () => {
    const prompts = await getPromptRegistry();
    const prompt = requirePrompt(prompts, 'gda.prompt.explain_generated_query');

    const result = prompt.callback({ response: 'SELECT * FROM sales GROUP BY region' });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('SELECT * FROM sales GROUP BY region');
  });

  it('prepare_data_analysis_report includes outputs', async () => {
    const prompts = await getPromptRegistry();
    const prompt = requirePrompt(prompts, 'gda.prompt.prepare_data_analysis_report');

    const result = prompt.callback({ outputs: 'revenue analysis output here' });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('revenue analysis output here');
  });
});
