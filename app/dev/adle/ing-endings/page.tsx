import { notFound } from "next/navigation";
import { IngPreview } from "./preview";

export default function IngPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <IngPreview />;
}
