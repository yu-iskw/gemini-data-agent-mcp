import { describe, expect, it } from 'vitest';

import { extractDatasourceReferences } from '../datasources.js';

import type { DataAgent } from '../../google/types.js';

describe('extractDatasourceReferences', () => {
  it('extracts BigQuery tables from published context', () => {
    const agent: DataAgent = {
      name: 'projects/p1/locations/global/dataAgents/a1',
      dataAnalyticsAgent: {
        publishedContext: {
          datasourceReferences: {
            bq: {
              tableReferences: [
                { projectId: 'p1', datasetId: 'ds', tableId: 'orders' },
                { projectId: 'p1', datasetId: 'ds', tableId: 'products' },
              ],
            },
          },
        },
      },
    };

    const summary = extractDatasourceReferences(agent);
    expect(summary.published?.bigQueryTables).toEqual([
      { projectId: 'p1', datasetId: 'ds', tableId: 'orders' },
      { projectId: 'p1', datasetId: 'ds', tableId: 'products' },
    ]);
    expect(summary.staging).toBeNull();
  });

  it('extracts staging and published contexts separately', () => {
    const agent: DataAgent = {
      name: 'projects/p1/locations/global/dataAgents/a1',
      dataAnalyticsAgent: {
        publishedContext: {
          datasourceReferences: {
            looker: {
              exploreReferences: [{ lookmlModel: 'model', explore: 'orders' }],
            },
          },
        },
        stagingContext: {
          datasourceReferences: {
            bq: {
              tableReferences: [{ projectId: 'p1', datasetId: 'sandbox', tableId: 'draft' }],
            },
          },
        },
      },
    };

    const summary = extractDatasourceReferences(agent);
    expect(summary.published?.lookerExplores).toEqual([
      { lookmlModel: 'model', explore: 'orders' },
    ]);
    expect(summary.staging?.bigQueryTables[0]?.tableId).toBe('draft');
  });

  it('returns null contexts when datasource references are absent', () => {
    const agent: DataAgent = {
      name: 'projects/p1/locations/global/dataAgents/a1',
      displayName: 'No datasources',
    };

    const summary = extractDatasourceReferences(agent);
    expect(summary.published).toBeNull();
    expect(summary.staging).toBeNull();
  });
});
