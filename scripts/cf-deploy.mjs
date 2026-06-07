// Cloudflare Workers Builds runs this for every branch. `convex deploy` with a
// production deploy key refuses to run in a non-production build environment, so
// running it on PR/preview branches fails the build. Gate it: only deploy Convex
// (with the prod key) on the production branch; every other branch just builds,
// which still verifies the bundle compiles.
import { execSync } from 'node:child_process';

const PRODUCTION_BRANCH = process.env.CONVEX_PRODUCTION_BRANCH ?? 'main';

// Cloudflare Workers Builds exposes WORKERS_CI_BRANCH. Fall back to git, then to
// empty — an unknown branch is treated as non-production so we never deploy to
// prod by accident from an environment we can't identify.
function currentBranch() {
  if (process.env.WORKERS_CI_BRANCH) return process.env.WORKERS_CI_BRANCH;
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

const branch = currentBranch();
const isProduction = branch === PRODUCTION_BRANCH;

if (isProduction) {
  console.log(`[cf-deploy] branch "${branch}" is production — deploying Convex + building.`);
  run("convex deploy --cmd 'pnpm build' --cmd-url-env-var-name VITE_CONVEX_URL");
} else {
  console.log(
    `[cf-deploy] branch "${branch || '(unknown)'}" is not production ("${PRODUCTION_BRANCH}") — building only, skipping convex deploy.`
  );
  run('pnpm build');
}
