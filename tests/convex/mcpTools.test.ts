import { describe, expect, it } from 'vitest';
import { getTool, MCP_TOOLS } from '../../convex/lib/mcpTools';

const EXPECTED_NAMES = [
  'get_cafe_info',
  'get_kpis',
  'get_sales_summary',
  'get_top_products',
  'get_low_stock',
];

describe('MCP_TOOLS', () => {
  it('contains exactly the expected tool names', () => {
    expect(MCP_TOOLS.map((t) => t.name).sort()).toEqual([...EXPECTED_NAMES].sort());
  });

  it('gives every tool a non-empty description and an object inputSchema', () => {
    for (const tool of MCP_TOOLS) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(typeof tool.inputSchema).toBe('object');
      expect(tool.inputSchema).not.toBeNull();
    }
  });
});

describe('getTool', () => {
  it('returns the matching tool for a known name', () => {
    expect(getTool('get_kpis')?.name).toBe('get_kpis');
  });

  it('returns undefined for an unknown name', () => {
    expect(getTool('nope')).toBeUndefined();
  });
});
