// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// This test targets the class of bug fixed for /_pos/menu/modifiers: a parent
// route declares a `component:` that renders a full page instead of
// `<Outlet/>`, so its file-based children (e.g. modifiers.$groupId.tsx) are
// generated as nested routes but never mount, no typecheck or component test
// catches this because vitest here runs under edge-runtime and only collects
// *.test.ts, nothing renders. This reads the generated route tree, finds
// every route that TanStack gave file children, and asserts that if that
// route's source sets a `component:`, it also renders `<Outlet/>`.
const ROOT = resolve(__dirname, '../..');
const ROUTE_TREE_PATH = resolve(ROOT, 'src/routeTree.gen.ts');

// Intentionally does not render <Outlet/>: the onboarding wizard resolves the
// active step from the URL and renders it directly so AnimatePresence can
// animate the outgoing and incoming steps together (see the comment at
// onboarding/route.tsx:36-38).
const OUTLET_EXEMPT_SOURCE_FILES = new Set<string>(['src/routes/_pos/onboarding/route.tsx']);

function resolveSourceFile(relRoutePath: string): string {
  const tsxPath = `src/${relRoutePath}.tsx`;
  if (existsSync(resolve(ROOT, tsxPath))) return tsxPath;
  const tsPath = `src/${relRoutePath}.ts`;
  if (existsSync(resolve(ROOT, tsPath))) return tsPath;
  throw new Error(`Could not resolve a source file for route import path "${relRoutePath}"`);
}

describe('route tree: parent routes with a component must render <Outlet/>', () => {
  const tree = readFileSync(ROUTE_TREE_PATH, 'utf-8');

  // Map every generated `Route as XRouteImport` identifier to the source
  // file it was imported from.
  const importMap = new Map<string, string>();
  for (const match of tree.matchAll(
    /import \{ Route as (\w+RouteImport) \} from '\.\/(routes\/[^']+)'/g
  )) {
    const [, ident, relPath] = match;
    if (!ident || !relPath) continue;
    importMap.set(ident, relPath);
  }

  // Every route that TanStack gave file children (i.e. has a `XRouteChildren`
  // object built for it) is a parent route in the sense this bug affects.
  const parentIdents: string[] = [];
  for (const match of tree.matchAll(/const (\w+)RouteChildren: \1RouteChildren/g)) {
    const [, prefix] = match;
    if (!prefix) continue;
    parentIdents.push(`${prefix}RouteImport`);
  }

  it('found at least one parent route to check', () => {
    expect(parentIdents.length).toBeGreaterThan(0);
  });

  it('every parent route with a component renders <Outlet/>, except the allowlisted exception', () => {
    const offenders: string[] = [];

    for (const ident of parentIdents) {
      const relPath = importMap.get(ident);
      if (!relPath) {
        throw new Error(`No import found for parent route identifier "${ident}"`);
      }

      const sourceFile = resolveSourceFile(relPath);
      if (OUTLET_EXEMPT_SOURCE_FILES.has(sourceFile)) continue;

      const source = readFileSync(resolve(ROOT, sourceFile), 'utf-8');
      // Only a bare `component:` forces the Outlet requirement. `errorComponent:`
      // and friends must not match: a route that sets those but no `component:`
      // still gets TanStack's default Outlet, so its children do mount.
      const hasComponent = /(?<![A-Za-z])component:/.test(source);
      if (!hasComponent) continue;

      if (!source.includes('<Outlet')) {
        offenders.push(sourceFile);
      }
    }

    expect(
      offenders,
      `A parent route with a component must render <Outlet/> or its children never mount. Offending file(s):\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
