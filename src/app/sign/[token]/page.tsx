import type { Metadata } from "next";
import { SignClient } from "./sign-client";

export const metadata: Metadata = {
  title: "חתימה דיגיטלית — ברק שירותים",
  robots: { index: false, follow: false },
};

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SignClient token={token} />;
}
