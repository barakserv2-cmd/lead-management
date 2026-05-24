import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // radix-ui intentionally excluded: it broke the AddLeadDialog submit
    // button in production (form click stopped firing onSubmit). The
    // unified `radix-ui` package's export shape doesn't play well with
    // Next.js's barrel-import optimization yet. Re-add only after a
    // verified retest if the package itself is fixed.
    optimizePackageImports: ["lucide-react", "recharts"],
  },
};

export default nextConfig;
