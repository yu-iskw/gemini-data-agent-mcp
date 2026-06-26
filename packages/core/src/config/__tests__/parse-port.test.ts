import { describe, expect, it } from 'vitest';

import { DataAgentMcpError } from '../../types.js';
import { parsePort } from '../parse-port.js';

describe('parsePort', () => {
  it('parses valid ports', () => {
    expect(parsePort('PORT', '8080')).toBe(8080);
    expect(parsePort('PORT', ' 65535 ')).toBe(65535);
  });

  it('rejects non-numeric values', () => {
    expect(() => parsePort('PORT', '8080abc')).toThrow(DataAgentMcpError);
    expect(() => parsePort('PORT', '12.5')).toThrow(DataAgentMcpError);
  });

  it('rejects out-of-range ports', () => {
    expect(() => parsePort('PORT', '0')).toThrow(DataAgentMcpError);
    expect(() => parsePort('PORT', '65536')).toThrow(DataAgentMcpError);
  });
});
