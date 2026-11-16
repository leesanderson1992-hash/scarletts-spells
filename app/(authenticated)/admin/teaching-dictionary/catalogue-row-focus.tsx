"use client";

import { useEffect } from "react";

export function CatalogueRowFocus({ id }: { id: string }) {
  useEffect(() => {
    const rowLink = document.getElementById(id);
    // The Catalogue table can stream after Next has attempted the hash scroll.
    rowLink?.focus({ preventScroll: true });
    (rowLink ?? document.getElementById("dictionary-word-search"))?.scrollIntoView({ block: "start" });
  }, [id]);
  return null;
}
