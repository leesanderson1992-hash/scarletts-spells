import { notFound } from "next/navigation";

import { AdleTemplateMenu } from "./template-menu";

export default function AdleTemplateMenuPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return <AdleTemplateMenu />;
}
