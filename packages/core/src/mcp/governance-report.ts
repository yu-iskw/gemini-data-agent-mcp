import { randomUUID } from 'node:crypto';

import { buildInventoryFindings } from './inventory.js';
import { GovernanceReportSchema, type GovernanceReport } from './schemas.js';

import type { AgentUsageSummary } from './agent-usage.js';
import type { DataAgent } from '../google/types.js';

const POSSIBLY_UNUSED_REASON =
  'No conversation activity in the usage window (heuristic only — REST has no lastUsed).';

/** Cap per-agent possibly-unused rows to keep report payloads bounded. */
export const MAX_POSSIBLY_UNUSED_ENTRIES = 100;

export function buildGovernanceReport(input: {
  project: string;
  location: string;
  agents: DataAgent[];
  inventoryTruncated: boolean;
  agentUsage: AgentUsageSummary[];
  usageWindowDays: number;
  conversationsTruncated?: boolean;
}): GovernanceReport {
  const {
    project,
    location,
    agents,
    inventoryTruncated,
    agentUsage,
    usageWindowDays,
    conversationsTruncated,
  } = input;
  const agentNames = agents.map((item) => item.name);
  const findings = buildInventoryFindings(agents);

  const unusedNames = agentUsage.filter((item) => !item.usedInWindow).map((item) => item.name);
  const capped = unusedNames.slice(0, MAX_POSSIBLY_UNUSED_ENTRIES);
  const possiblyUnusedTruncated = unusedNames.length > capped.length;
  const possiblyUnused = capped.map((name) => ({
    name,
    confidence: 'low' as const,
    reason: POSSIBLY_UNUSED_REASON,
  }));

  const report: GovernanceReport = {
    reportId: randomUUID(),
    generatedAt: new Date().toISOString(),
    scope: {
      projects: [project],
      locations: [location],
      dataAgents: agentNames,
    },
    summary: {
      dataAgentCount: agents.length,
      usageWindowDays,
      findingCount: findings.length,
      unusedAgentCount: unusedNames.length,
    },
    findings,
    evidence: agentNames.map((resourceName) => ({
      source: 'dataAgent' as const,
      resourceName,
      redacted: false,
    })),
    agentUsage,
    possiblyUnused,
    inventoryTruncated,
    possiblyUnusedTruncated,
    conversationsTruncated,
  };

  GovernanceReportSchema.parse(report);
  return report;
}
