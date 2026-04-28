import { describe, it, expect } from 'vitest';

type PromptCallback = (args: Record<string, string>) => { messages: Array<{ content: { text: string } }> };
type PromptRegistry = Record<string, { callback: PromptCallback } | undefined>;

async function getPromptRegistry() {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { registerPrompts } = await import('../mcp-surface/prompts.js');
  const server = new McpServer({ name: 'test', version: '0.1.0' });
  registerPrompts(server);
  return (server as unknown as { _registeredPrompts: PromptRegistry })._registeredPrompts;
}

describe('Prompt templates', () => {
  it('analyze_data_question template includes agent and question in output', async () => {
    const prompts = await getPromptRegistry();
    const prompt = prompts['analyze_data_question'];
    if (!prompt) return;

    const result = prompt.callback({ agent: 'sales-prod', question: 'Why did revenue drop?' });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('sales-prod');
    expect(text).toContain('Why did revenue drop?');
  });

  it('compare_segments prompt includes all required fields', async () => {
    const prompts = await getPromptRegistry();
    const prompt = prompts['compare_segments'];
    if (!prompt) return;

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
    const prompt = prompts['investigate_data_issue'];
    if (!prompt) return;

    const result = prompt.callback({ agent: 'finance', issue: 'margin dropped 10%' });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('finance');
    expect(text).toContain('margin dropped 10%');
  });

  it('find_anomalies prompt includes metric and dimensions', async () => {
    const prompts = await getPromptRegistry();
    const prompt = prompts['find_anomalies'];
    if (!prompt) return;

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
    const prompt = prompts['explain_generated_query'];
    if (!prompt) return;

    const result = prompt.callback({ response: 'SELECT * FROM sales GROUP BY region' });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('SELECT * FROM sales GROUP BY region');
  });

  it('prepare_data_analysis_report includes outputs', async () => {
    const prompts = await getPromptRegistry();
    const prompt = prompts['prepare_data_analysis_report'];
    if (!prompt) return;

    const result = prompt.callback({ outputs: 'revenue analysis output here' });
    const text = result.messages[0]?.content.text ?? '';
    expect(text).toContain('revenue analysis output here');
  });
});
