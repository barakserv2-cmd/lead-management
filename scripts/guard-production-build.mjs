// Production build gate — runs before `next build` (package.json "build").
//
// Why: on 28–29/09 production kept falling back to the previous design.
// Someone ran `vercel --prod` from a local checkout that was missing commits
// already merged to main, and the CLI uploads the local folder, not main.
// A rule in the ship skill was not enough — a stale checkout has a stale
// skill too. This gate lives in the build, so any production build of code
// that is missing commits from main fails, and the live site is left alone.
//
// Only production builds are checked. Previews and local builds pass
// straight through. A production build must be main itself: a commit from
// another branch (a promoted preview, `vercel --prod` from a branch), one
// that was never merged, or one missing commits from main is stopped.
// When GitHub can't be asked (down, rate limit) the build is allowed — a
// GitHub outage must not freeze production. The PR checks on main are the
// first gate; this one catches what goes around them.

const REPO = "barakserv2-cmd/lead-management";

if (process.env.VERCEL_ENV !== "production") process.exit(0);

const sha = process.env.VERCEL_GIT_COMMIT_SHA;
if (!sha) {
  console.error(
    "\n✖ Production build without a git commit (VERCEL_GIT_COMMIT_SHA is empty).\n" +
      "  Production is deployed only from main on GitHub — merge to main and Vercel deploys it.\n" +
      "  Do not use `vercel --prod`.\n"
  );
  process.exit(1);
}

// Vercel names the branch a git deployment came from. Production is main only.
const ref = process.env.VERCEL_GIT_COMMIT_REF;
if (ref && ref !== "main") {
  console.error(
    `\n✖ Production build from branch "${ref}" — production is built only from main.\n` +
      "  Merge the PR to main and Vercel deploys it. Do not promote a preview or use `vercel --prod`.\n"
  );
  process.exit(1);
}

/** Can't ask GitHub — allow the build rather than freeze production on an outage. */
function cannotVerify(why) {
  console.warn(`⚠ build guard: could not verify against main (${why}), allowing the build.`);
  process.exit(0);
}

async function compare(token) {
  return fetch(`https://api.github.com/repos/${REPO}/compare/main...${sha}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "lead-management-build-guard",
      // optional: without a token GitHub allows 60 anonymous calls/hour per IP,
      // and Vercel build machines share IPs
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
}

let token = process.env.GITHUB_TOKEN || null;
let res;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    res = await compare(token);
    // a token GitHub rejects (expired, wrong scope) — ask again without it
    if (res.status === 401 && token) {
      token = null;
      continue;
    }
    if (res.ok || res.status === 404 || res.status < 500) break;
  } catch (err) {
    if (attempt === 3) cannotVerify(`GitHub unreachable: ${err}`);
  }
  await new Promise((r) => setTimeout(r, 3000));
}

if (res.status === 404) {
  // GitHub does not know this commit: it was never pushed (a local-only deploy)
  console.error(
    `\n✖ Commit ${sha.slice(0, 7)} is not on GitHub — it was never pushed.\n` +
      "  Production is deployed only from main. Push and merge to main instead of `vercel --prod`.\n"
  );
  process.exit(1);
}
if (!res.ok) cannotVerify(`GitHub answered ${res.status}`);

const { status, behind_by: behind, ahead_by: ahead } = await res.json();
// identical = this commit is main. Anything else is not what main holds.
if (status === "identical") {
  console.log(`✓ build guard: ${sha.slice(0, 7)} is main.`);
  process.exit(0);
}
if (status === "ahead") {
  console.error(
    `\n✖ Commit ${sha.slice(0, 7)} has ${ahead} commit(s) that are not on main — it was never merged.\n` +
      "  Production is built only from main. Merge the PR, and Vercel deploys main.\n"
  );
  process.exit(1);
}

console.error(
  `\n✖ Commit ${sha.slice(0, 7)} is missing ${behind} commit(s) that are already on main (${status}).\n` +
    "  Deploying it would roll production back. Stopping the build — the live site is unchanged.\n" +
    "  Fix: open a PR from an up-to-date branch and merge it; Vercel deploys main. Never `vercel --prod`.\n"
);
process.exit(1);
