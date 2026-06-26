import { describe, expect, it } from 'vitest';

import { buildInventoryFindings, mapInventoryAgent } from '../inventory.js';

import type { DataAgent } from '../../google/types.js';

const fullAgent: DataAgent = {
  name: 'projects/p/locations/global/dataAgents/a1',
  displayName: 'Agent One',
  description: 'Has a description',
  labels: { owner: 'team-a' },
  createTime: '2026-01-01T00:00:00Z',
  updateTime: '2026-01-02T00:00:00Z',
};

describe('mapInventoryAgent', () => {
  it('flags missing description and owner label', () => {
    const mapped = mapInventoryAgent({
      name: fullAgent.name,
    });
    expect(mapped.missingDescription).toBe(true);
    expect(mapped.missingOwnerLabel).toBe(true);
  });

  it('reports no gaps when description and owner label exist', () => {
    const mapped = mapInventoryAgent(fullAgent);
    expect(mapped.missingDescription).toBe(false);
    expect(mapped.missingOwnerLabel).toBe(false);
    expect(mapped.displayName).toBe('Agent One');
    expect(mapped.labels).toEqual({ owner: 'team-a' });
  });

  it('treats empty labels as missing owner', () => {
    const mapped = mapInventoryAgent({
      ...fullAgent,
      labels: {},
    });
    expect(mapped.missingOwnerLabel).toBe(true);
    expect(mapped.missingDescription).toBe(false);
  });
});

describe('buildInventoryFindings', () => {
  it('returns no findings for well-formed agents', () => {
    expect(buildInventoryFindings([fullAgent])).toEqual([]);
  });

  it('emits description and owner findings when both are missing', () => {
    const agent: DataAgent = { name: 'projects/p/locations/global/dataAgents/a2' };
    const findings = buildInventoryFindings([agent]);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({
      id: `${agent.name}-missing-description`,
      severity: 'low',
      category: 'inventory',
    });
    expect(findings[1]).toMatchObject({
      id: `${agent.name}-missing-owner`,
      severity: 'medium',
      category: 'inventory',
    });
  });

  it('emits only description finding when owner label is present', () => {
    const agent: DataAgent = {
      name: 'projects/p/locations/global/dataAgents/a3',
      labels: { owner: 'team-b' },
    };
    const findings = buildInventoryFindings([agent]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe(`${agent.name}-missing-description`);
  });

  it('emits only owner finding when description is present', () => {
    const agent: DataAgent = {
      name: 'projects/p/locations/global/dataAgents/a4',
      description: 'Documented',
    };
    const findings = buildInventoryFindings([agent]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe(`${agent.name}-missing-owner`);
  });

  it('aggregates findings across multiple agents', () => {
    const findings = buildInventoryFindings([
      fullAgent,
      { name: 'projects/p/locations/global/dataAgents/a5' },
    ]);
    expect(findings).toHaveLength(2);
  });

  it('returns empty findings for an empty agent list', () => {
    expect(buildInventoryFindings([])).toEqual([]);
  });
});
