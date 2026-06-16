import { redact, redactServiceAccount, validateConfig } from '@gemini-data-agents/core';
import { describe, it, expect } from 'vitest';

const config = validateConfig({
  api_version: 'v1beta',
  agents: {
    'my-agent': {
      display_name: 'My Agent',
      description: 'Test agent',
      data_agent: 'projects/my-project/locations/us-central1/dataAgents/my-agent',
      impersonate_service_account: 'my-sa@my-project.iam.gserviceaccount.com',
      tools: ['query_data_agent'],
    },
  },
});

describe('Resource content safety', () => {
  it('redacts auth config before exposing as resource', () => {
    const agentConfig = config.agents['my-agent']!;
    const redacted = redact(
      {
        auth: {
          mode: agentConfig.auth.mode,
          token: 'should-be-redacted',
          impersonate_service_account: agentConfig.auth.impersonate_service_account,
        },
      },
      true,
    ) as { auth: Record<string, unknown> };

    expect(redacted.auth['token']).toBe('[REDACTED]');
    expect(redacted.auth['mode']).toBe('impersonation');
    expect(redacted.auth['impersonate_service_account']).toBe(
      'my-sa@my-project.iam.gserviceaccount.com',
    );
  });

  it('service account is shown fully by default (show_service_account: full)', () => {
    const email = 'my-sa@my-project.iam.gserviceaccount.com';
    expect(redactServiceAccount(email, 'full')).toBe(email);
  });

  it('service account is hidden when show_service_account: hidden', () => {
    expect(redactServiceAccount('my-sa@my-project.iam.gserviceaccount.com', 'hidden')).toBe(
      '[REDACTED]',
    );
  });

  it('tools list is exposed for agent resources', () => {
    const tools = config.agents['my-agent']!.tools;
    expect(tools).toContain('query_data_agent');
  });

  it('agents list does not include auth tokens', () => {
    const agentList = Object.entries(config.agents).map(([name, agent]) => ({
      name,
      project: agent.project,
      tools: agent.tools,
    }));

    const json = JSON.stringify(agentList);
    expect(json).not.toContain('token');
    expect(json).not.toContain('Bearer');
  });
});
