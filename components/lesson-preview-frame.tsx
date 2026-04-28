"use client";

import { useMemo, useState } from "react";

type LessonPreviewFrameProps = {
  contentHtml: string;
};

function injectBranding(html: string) {
  const brandStyle = `
<style id="scarlett-lesson-preview-overrides">
  html, body {
    background: #fffdf8 !important;
    color: #2f2430 !important;
    font-family: "Nunito", ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  }
  body {
    margin: 0 !important;
  }
  a {
    color: #b91c64 !important;
  }
</style>`;

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${brandStyle}</head>`);
  }

  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${brandStyle}</head>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    ${brandStyle}
  </head>
  <body>${html}</body>
</html>`;
}

export function LessonPreviewFrame({ contentHtml }: LessonPreviewFrameProps) {
  const [frameHeight, setFrameHeight] = useState(960);
  const srcDoc = useMemo(() => injectBranding(contentHtml), [contentHtml]);

  function syncHeight(frame: HTMLIFrameElement | null) {
    const frameDocument = frame?.contentDocument;

    if (!frameDocument) {
      return;
    }

    const nextHeight = Math.max(
      frameDocument.documentElement.scrollHeight,
      frameDocument.body?.scrollHeight ?? 0,
      720,
    );

    setFrameHeight(nextHeight + 8);
  }

  return (
    <div className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-white shadow-[0_14px_40px_rgba(79,38,66,0.06)]">
      <iframe
        title="Current lesson preview"
        srcDoc={srcDoc}
        onLoad={(event) => {
          const frame = event.currentTarget;
          syncHeight(frame);
          window.setTimeout(() => syncHeight(frame), 250);
        }}
        style={{ height: `${frameHeight}px` }}
        className="w-full border-0 bg-white"
      />
    </div>
  );
}
