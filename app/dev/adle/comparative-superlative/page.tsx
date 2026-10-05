import { notFound } from "next/navigation";
import { ComparativePreview } from "./preview";
export default function ComparativePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ComparativePreview />;
}
