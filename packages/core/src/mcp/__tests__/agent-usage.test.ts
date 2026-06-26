import { describe, expect, it } from 'vitest';

import { summarizeAgentUsage } from '../agent-usage.js';

import type { Conversation } from '../../google/types.js';

describe('summarizeAgentUsage', () => {
  const agents = [
    { name: 'projects/p/locations/global/dataAgents/a1' },
    { name: 'projects/p/locations/global/dataAgents/a2' },
  ];

  const windowEnd = new Date('2026-06-26T12:00:00.000Z');

  it('marks agents used when linked conversations fall in the window', () => {
    const conversations: Conversation[] = [
      {
        name: 'projects/p/locations/global/conversations/c1',
        dataAgent: agents[0].name,
        updateTime: '2026-06-20T10:00:00.000Z',
      },
    ];

    const summary = summarizeAgentUsage({
      agents,
      conversations,
      windowDays: 30,
      windowEnd,
    });

    expect(summary[0]).toMatchObject({
      name: agents[0].name,
      usedInWindow: true,
      conversationCountInWindow: 1,
      confidence: 'medium',
    });
    expect(summary[1]).toMatchObject({
      name: agents[1].name,
      usedInWindow: false,
      conversationCountInWindow: 0,
      confidence: 'low',
    });
  });

  it('ignores conversations outside the window', () => {
    const conversations: Conversation[] = [
      {
        name: 'projects/p/locations/global/conversations/c-old',
        dataAgent: agents[0].name,
        updateTime: '2026-01-01T10:00:00.000Z',
      },
    ];

    const summary = summarizeAgentUsage({
      agents,
      conversations,
      windowDays: 30,
      windowEnd,
    });

    expect(summary.every((item) => !item.usedInWindow)).toBe(true);
  });
});
