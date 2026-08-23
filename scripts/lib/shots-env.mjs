/**
 * Refuses to let the screenshot pipeline seed anything unless the operator has
 * explicitly allowlisted a dedicated Convex deployment for it.
 *
 * Why this exists: `seed:run` with `purge: true` hard-deletes rows across ~29
 * tables, and per CHANGELOG.md the deployed app currently points at the DEV
 * deployment (production cutover pending). Seeding the wrong deployment wipes
 * the data behind the live site. There is deliberately no default and no
 * fallback — an unset allowlist is an error, never "use whatever is configured".
 */
export function assertShotsDeployment({ configured, allowed }) {
  const allowlisted = typeof allowed === 'string' ? allowed.trim() : '';
  if (!allowlisted) {
    throw new Error(
      'SHOTS_CONVEX_DEPLOYMENT is not set. The screenshot pipeline purges data, so it ' +
        'refuses to run without an explicitly allowlisted, dedicated Convex deployment. ' +
        'Never point it at the deployment the app is served from.'
    );
  }
  const current = typeof configured === 'string' ? configured.trim() : '';
  if (!current) {
    throw new Error('CONVEX_DEPLOYMENT is not set, so the target deployment cannot be verified.');
  }
  if (current !== allowlisted) {
    throw new Error(
      `Refusing to seed: CONVEX_DEPLOYMENT is "${current}" but SHOTS_CONVEX_DEPLOYMENT ` +
        `allows only "${allowlisted}".`
    );
  }
}
