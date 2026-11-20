import { NextResponse } from "next/server";
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
export function authRetryResponse(target: URL) {
  const retry = escapeHtml(target.pathname + target.search);
  return new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Check your connection · Scarlett Spells</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff9fc;color:#242338;font:18px/1.6 system-ui,sans-serif}main{max-width:30rem;padding:2rem}strong{color:#ed238a}h1{font-size:1.7rem;line-height:1.3}a{display:inline-block;background:#ed238a;color:white;padding:.65rem 1.4rem;border-radius:.7rem;font-weight:600;text-decoration:none}a:focus-visible{outline:3px solid #242338;outline-offset:4px}</style><main><strong>✧ Scarlett Spells</strong><h1>We couldn’t check your sign-in</h1><p>The connection is taking longer than expected. Your saved sign-in has been kept.</p><p>Try again to return to your page.</p><a href="${retry}">Try again</a></main></html>`, {
    status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Retry-After": "3",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" },
  });
}
