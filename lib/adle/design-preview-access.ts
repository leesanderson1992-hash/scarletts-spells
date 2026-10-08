export function canOpenAdleDesignPreview() {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";
}
