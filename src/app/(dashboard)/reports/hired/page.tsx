import { redirect } from "next/navigation";

// The hired report now lives inside the reports hub.
export default function HiredReportPage() {
  redirect("/reports?tab=hired");
}
