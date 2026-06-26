export const DEFAULT_AGENTOPS_STAGING_UPDATE_MASK = 'dataAnalyticsAgent.stagingContext';

const AGENTOPS_ALLOWED_PATCH_PATHS = new Set([
  DEFAULT_AGENTOPS_STAGING_UPDATE_MASK,
  'displayName',
  'description',
  'labels',
]);

const AGENTOPS_ALLOWED_CONTEXT_VERSIONS = new Set(['STAGING', 'CONTEXT_VERSION_UNSPECIFIED']);

function parseFieldMaskPaths(updateMask: string): string[] {
  return updateMask
    .split(',')
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

export function assertAgentOpsPatchMask(updateMask: string): void {
  const paths = parseFieldMaskPaths(updateMask);
  if (paths.length === 0) {
    throw new Error('update_mask must include at least one field path.');
  }

  for (const path of paths) {
    if (!AGENTOPS_ALLOWED_PATCH_PATHS.has(path)) {
      throw new Error(
        `agentops patch disallowed field path: ${path}. Allowed: ${[...AGENTOPS_ALLOWED_PATCH_PATHS].join(', ')}.`,
      );
    }
  }
}

export function assertAgentOpsContextVersion(contextVersion: string | undefined): void {
  if (contextVersion === undefined) {
    return;
  }
  if (!AGENTOPS_ALLOWED_CONTEXT_VERSIONS.has(contextVersion)) {
    throw new Error(
      `agentops behavior.chat disallowed context_version: ${contextVersion}. Allowed: STAGING, CONTEXT_VERSION_UNSPECIFIED.`,
    );
  }
}

const ADMIN_ALLOWED_PATCH_PATHS = new Set([
  'dataAnalyticsAgent.publishedContext',
  'displayName',
  'description',
  'labels',
]);

export function assertAdminPatchMask(updateMask: string): void {
  const paths = parseFieldMaskPaths(updateMask);
  if (paths.length === 0) {
    throw new Error('update_mask must include at least one field path.');
  }

  for (const path of paths) {
    if (!ADMIN_ALLOWED_PATCH_PATHS.has(path)) {
      throw new Error(
        `admin patch disallowed field path: ${path}. Allowed: ${[...ADMIN_ALLOWED_PATCH_PATHS].join(', ')}.`,
      );
    }
  }
}
