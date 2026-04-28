import { describe, it, expect } from 'vitest';

import { validateConfig } from '../config/loader.js';
import { redact, redactServiceAccount } from '../security/redaction.js';

const config = validateConfig({
  agents: {
    'my-agent': {
      display_name: 'My Agent',
      description: 'Test agent',
      project: 'my-project',
      location: 'us-central1',
      api_version: 'v1beta',
      data_agent: 'projects/my-project/locations/us-central1/dataAgents/my-agent',
      auth: {
        mode: 'impersonation',
        source: 'adc',
        impersonate_service_account: 'my-sa@my-project.iam.gserviceaccount.com',
      },
      capabilities: {
        query_data: true,
        a2a_send: false,
        a2a_stream: false,
        chat: false,
        raw_passthrough: false,
      },
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

  it('capabilities resource shows all capabilities', () => {
    const caps = config.agents['my-agent']!.capabilities;
    expect(caps.query_data).toBe(true);
    expect(caps.a2a_send).toBe(false);
  });

  it('agents list does not include auth tokens', () => {
    const agentList = Object.entries(config.agents).map(([name, agent]) => ({
      name,
      project: agent.project,
      capabilities: agent.capabilities,
    }));

    const json = JSON.stringify(agentList);
    expect(json).not.toContain('token');
    expect(json).not.toContain('Bearer');
  });
});
