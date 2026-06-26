import type { DataAgent } from '../google/types.js';

export type BigQueryTableRef = {
  projectId: string;
  datasetId: string;
  tableId: string;
};

export type LookerExploreRef = {
  lookmlModel: string;
  explore: string;
};

export type DatabaseTableRef = {
  tableId: string;
};

export type DatasourceContextSummary = {
  bigQueryTables: BigQueryTableRef[];
  lookerExplores: LookerExploreRef[];
  databaseTables: DatabaseTableRef[];
};

export type AgentDatasourceSummary = {
  name: string;
  published: DatasourceContextSummary | null;
  staging: DatasourceContextSummary | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function parseBigQueryTables(refs: Record<string, unknown>): BigQueryTableRef[] {
  const bq = asRecord(refs.bq);
  if (!bq) {
    return [];
  }
  const tableReferences = bq.tableReferences;
  if (!Array.isArray(tableReferences)) {
    return [];
  }
  const tables: BigQueryTableRef[] = [];
  for (const item of tableReferences) {
    const row = asRecord(item);
    if (!row || typeof row.projectId !== 'string' || typeof row.datasetId !== 'string') {
      continue;
    }
    if (typeof row.tableId !== 'string') {
      continue;
    }
    tables.push({
      projectId: row.projectId,
      datasetId: row.datasetId,
      tableId: row.tableId,
    });
  }
  return tables;
}

function parseLookerExplores(refs: Record<string, unknown>): LookerExploreRef[] {
  const looker = asRecord(refs.looker);
  if (!looker) {
    return [];
  }
  const exploreReferences = looker.exploreReferences;
  if (!Array.isArray(exploreReferences)) {
    return [];
  }
  const explores: LookerExploreRef[] = [];
  for (const item of exploreReferences) {
    const row = asRecord(item);
    if (!row || typeof row.lookmlModel !== 'string' || typeof row.explore !== 'string') {
      continue;
    }
    explores.push({ lookmlModel: row.lookmlModel, explore: row.explore });
  }
  return explores;
}

function parseDatabaseTablesFromRef(dbRef: Record<string, unknown> | null): DatabaseTableRef[] {
  if (!dbRef) {
    return [];
  }
  const databaseReference = asRecord(dbRef.databaseReference);
  if (!databaseReference) {
    return [];
  }
  const tables: DatabaseTableRef[] = [];
  const tableIds = databaseReference.tableIds;
  if (Array.isArray(tableIds)) {
    for (const tableId of tableIds) {
      if (typeof tableId === 'string') {
        tables.push({ tableId });
      }
    }
  }
  const databaseTableReferences = databaseReference.databaseTableReferences;
  if (Array.isArray(databaseTableReferences)) {
    for (const item of databaseTableReferences) {
      const row = asRecord(item);
      if (row && typeof row.tableId === 'string') {
        tables.push({ tableId: row.tableId });
      }
    }
  }
  return tables;
}

function parseDatabaseTables(refs: Record<string, unknown>): DatabaseTableRef[] {
  return [
    ...parseDatabaseTablesFromRef(asRecord(refs.alloydb)),
    ...parseDatabaseTablesFromRef(asRecord(refs.spannerReference)),
    ...parseDatabaseTablesFromRef(asRecord(refs.cloudSqlReference)),
  ];
}

function parseContext(context: unknown): DatasourceContextSummary | null {
  const ctx = asRecord(context);
  if (!ctx) {
    return null;
  }
  const datasourceReferences = asRecord(ctx.datasourceReferences);
  if (!datasourceReferences) {
    return null;
  }
  return {
    bigQueryTables: parseBigQueryTables(datasourceReferences),
    lookerExplores: parseLookerExplores(datasourceReferences),
    databaseTables: parseDatabaseTables(datasourceReferences),
  };
}

function isEmptySummary(summary: DatasourceContextSummary): boolean {
  return (
    summary.bigQueryTables.length === 0 &&
    summary.lookerExplores.length === 0 &&
    summary.databaseTables.length === 0
  );
}

export function extractDatasourceReferences(agent: DataAgent): AgentDatasourceSummary {
  const analytics = asRecord(agent.dataAnalyticsAgent);
  const publishedRaw = analytics ? parseContext(analytics.publishedContext) : null;
  const stagingRaw = analytics ? parseContext(analytics.stagingContext) : null;

  return {
    name: agent.name,
    published: publishedRaw && !isEmptySummary(publishedRaw) ? publishedRaw : null,
    staging: stagingRaw && !isEmptySummary(stagingRaw) ? stagingRaw : null,
  };
}
