import type { GovernanceReport } from './schemas.js';
import type { DataAgent } from '../google/types.js';

export function mapDataAgentSummary(item: DataAgent) {
  return {
    name: item.name,
    displayName: item.displayName,
    description: item.description,
    createTime: item.createTime,
    updateTime: item.updateTime,
    labels: item.labels,
  };
}

export function mapInventoryAgent(item: DataAgent) {
  return {
    ...mapDataAgentSummary(item),
    missingDescription: !item.description,
    missingOwnerLabel: !item.labels?.owner,
  };
}

export function buildInventoryFindings(agents: DataAgent[]): GovernanceReport['findings'] {
  const findings: GovernanceReport['findings'] = [];
  for (const item of agents) {
    if (!item.description) {
      findings.push({
        id: `${item.name}-missing-description`,
        category: 'inventory',
        severity: 'low',
        message: 'Data Agent is missing a description.',
        resourceName: item.name,
      });
    }
    if (!item.labels?.owner) {
      findings.push({
        id: `${item.name}-missing-owner`,
        category: 'inventory',
        severity: 'medium',
        message: 'Data Agent is missing an owner label.',
        resourceName: item.name,
      });
    }
  }
  return findings;
}
