import { describe, expect, it } from 'vitest';

import { buildGovernanceReport, MAX_POSSIBLY_UNUSED_ENTRIES } from '../governance-report.js';

describe('buildGovernanceReport', () => {
  const agents = [
    { name: 'projects/p/locations/global/dataAgents/a1' },
    { name: 'projects/p/locations/global/dataAgents/a2' },
  ];

  it('flags unused agents from agentUsage summaries', () => {
    const report = buildGovernanceReport({
      project: 'p',
      location: 'global',
      agents,
      inventoryTruncated: false,
      usageWindowDays: 30,
      agentUsage: [
        {
          name: agents[0].name,
          usedInWindow: true,
          conversationCountInWindow: 2,
          confidence: 'medium',
          lastActivityAt: '2026-06-20T10:00:00.000Z',
        },
        {
          name: agents[1].name,
          usedInWindow: false,
          conversationCountInWindow: 0,
          confidence: 'low',
        },
      ],
    });

    expect(report.summary.usageWindowDays).toBe(30);
    expect(report.summary.unusedAgentCount).toBe(1);
    expect(report.possiblyUnused).toHaveLength(1);
    expect(report.possiblyUnused?.[0]?.name).toBe(agents[1].name);
  });

  it('caps possiblyUnused entries', () => {
    const manyAgents = Array.from({ length: MAX_POSSIBLY_UNUSED_ENTRIES + 5 }, (_, i) => ({
      name: `projects/p/locations/global/dataAgents/a${i}`,
    }));

    const report = buildGovernanceReport({
      project: 'p',
      location: 'global',
      agents: manyAgents,
      inventoryTruncated: true,
      usageWindowDays: 30,
      agentUsage: manyAgents.map((agent) => ({
        name: agent.name,
        usedInWindow: false,
        conversationCountInWindow: 0,
        confidence: 'low' as const,
      })),
    });

    expect(report.possiblyUnused).toHaveLength(MAX_POSSIBLY_UNUSED_ENTRIES);
    expect(report.possiblyUnusedTruncated).toBe(true);
  });
});
