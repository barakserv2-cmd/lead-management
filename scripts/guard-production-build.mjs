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
// straight through. Network or API problems never block a deploy (fail
// open); only a definite "this commit is missing commits from main" does.

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

let res;
try {
  res = await fetch(`https://api.github.com/repos/${REPO}/compare/main...${sha}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "lead-management-build-guard",
      // optional: without a token GitHub allows 60 anonymous calls/hour per IP,
      // and Vercel build machines share IPs — past the limit the guard fails open
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
} catch (err) {
  console.warn(`⚠ build guard: GitHub unreachable (${err}), allowing the build.`);
  process.exit(0);
}

if (res.status === 404) {
  // GitHub does not know this commit: it was never pushed (a local-only deploy)
  console.error(
    `\n✖ Commit ${sha.slice(0, 7)} is not on GitHub — it was never pushed.\n` +
      "  Production is deployed only from main. Push and merge to main instead of `vercel --prod`.\n"
  );
  process.exit(1);
}
if (!res.ok) {
  console.warn(`⚠ build guard: GitHub answered ${res.status}, allowing the build.`);
  process.exit(0);
}

const { status, behind_by: behind } = await res.json();
// identical = this is main; ahead = main plus more commits. Both contain all of main.
if (status === "identical" || status === "ahead") {
  console.log(`✓ build guard: ${sha.slice(0, 7)} contains all of main (${status}).`);
  process.exit(0);
}

console.error(
  `\n✖ Commit ${sha.slice(0, 7)} is missing ${behind} commit(s) that are already on main (${status}).\n` +
    "  Deploying it would roll production back. Stopping the build — the live site is unchanged.\n" +
    "  Fix: git pull origin main, then merge to main and let Vercel deploy. Never `vercel --prod`.\n"
);
process.exit(1);
