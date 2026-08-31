import type { Metadata } from "next";
import { BookClient } from "./book-client";

export const metadata: Metadata = {
  title: "תיאום ראיון — ברק שירותים",
  robots: { index: false, follow: false },
};

export default async function BookPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <BookClient token={token} />;
}
