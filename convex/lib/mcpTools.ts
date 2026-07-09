import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { ActionCtx } from '../_generated/server';
import type { RangeArgs } from './time';

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (ctx: ActionCtx, cafeId: Id<'cafes'>, args: Record<string, unknown>) => Promise<unknown>;
};

// Mirrors `rangeArg` in `convex/lib/time.ts`: either a named preset or an
// explicit inclusive `from`/`to` pair of local "YYYY-MM-DD" date keys.
const RANGE = {
  description:
    'Time range: either {"preset": one of today|yesterday|last7|last30} or {"from","to"} ISO dates',
  oneOf: [
    {
      type: 'object',
      properties: {
        preset: { type: 'string', enum: ['today', 'yesterday', 'last7', 'last30'] },
      },
      required: ['preset'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { from: { type: 'string' }, to: { type: 'string' } },
      required: ['from', 'to'],
      additionalProperties: false,
    },
  ],
};

export const MCP_TOOLS: McpTool[] = [
  {
    name: 'get_cafe_info',
    description: 'Basic info about the outlet: name, timezone, tax, currency.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (ctx, cafeId) => ctx.runQuery(internal.mcpRead.cafeInfo, { cafeId }),
  },
  {
    name: 'get_kpis',
    description: 'Today vs yesterday: revenue, order count, average order value.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (ctx, cafeId) => ctx.runQuery(internal.mcpRead.kpis, { cafeId }),
  },
  {
    name: 'get_sales_summary',
    description: 'Revenue, orders, AOV and refunds for a time range.',
    inputSchema: {
      type: 'object',
      properties: { range: RANGE },
      required: ['range'],
      additionalProperties: false,
    },
    run: (ctx, cafeId, args) =>
      ctx.runQuery(internal.mcpRead.salesSummary, { cafeId, range: args.range as RangeArgs }),
  },
  {
    name: 'get_top_products',
    description: 'Best and worst selling products for a time range.',
    inputSchema: {
      type: 'object',
      properties: { range: RANGE, limit: { type: 'number', minimum: 1, maximum: 50 } },
      required: ['range'],
      additionalProperties: false,
    },
    run: (ctx, cafeId, args) =>
      ctx.runQuery(internal.mcpRead.topProducts, {
        cafeId,
        range: args.range as RangeArgs,
        ...(typeof args.limit === 'number' ? { limit: args.limit } : {}),
      }),
  },
  {
    name: 'get_low_stock',
    description: 'Ingredients at or below their reorder threshold.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: (ctx, cafeId) => ctx.runQuery(internal.mcpRead.lowStock, { cafeId }),
  },
];

export function getTool(name: string): McpTool | undefined {
  return MCP_TOOLS.find((t) => t.name === name);
}
