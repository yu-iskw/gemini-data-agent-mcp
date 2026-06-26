import { describe, expect, it } from 'vitest';

import {
  assertAgentOpsContextVersion,
  assertAgentOpsPatchMask,
  assertAdminPatchMask,
} from '../staging-guard.js';

describe('assertAgentOpsPatchMask', () => {
  it('allows staging and metadata paths', () => {
    expect(() =>
      assertAgentOpsPatchMask('dataAnalyticsAgent.stagingContext,displayName'),
    ).not.toThrow();
  });

  it('rejects publishedContext', () => {
    expect(() => assertAgentOpsPatchMask('dataAnalyticsAgent.publishedContext')).toThrow(
      /disallowed field path/,
    );
  });

  it('rejects mixed allowed and disallowed paths', () => {
    expect(() =>
      assertAgentOpsPatchMask(
        'dataAnalyticsAgent.stagingContext,dataAnalyticsAgent.publishedContext',
      ),
    ).toThrow(/publishedContext/);
  });
});

describe('assertAdminPatchMask', () => {
  it('allows published and metadata paths', () => {
    expect(() =>
      assertAdminPatchMask('dataAnalyticsAgent.publishedContext,displayName'),
    ).not.toThrow();
  });

  it('rejects stagingContext', () => {
    expect(() => assertAdminPatchMask('dataAnalyticsAgent.stagingContext')).toThrow(
      /disallowed field path/,
    );
  });

  it('rejects empty mask', () => {
    expect(() => assertAdminPatchMask('')).toThrow(/at least one field path/);
  });
});

describe('assertAgentOpsContextVersion', () => {
  it('allows STAGING and unspecified', () => {
    expect(() => assertAgentOpsContextVersion('STAGING')).not.toThrow();
    expect(() => assertAgentOpsContextVersion('CONTEXT_VERSION_UNSPECIFIED')).not.toThrow();
    expect(() => assertAgentOpsContextVersion(undefined)).not.toThrow();
  });

  it('rejects PUBLISHED', () => {
    expect(() => assertAgentOpsContextVersion('PUBLISHED')).toThrow(/disallowed context_version/);
  });
});
