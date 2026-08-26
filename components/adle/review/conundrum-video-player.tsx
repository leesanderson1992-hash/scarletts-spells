"use client";

import { useEffect, useRef, useState } from "react";
import type { FrozenConundrumVideo } from "@/lib/adle/review-v3/conundrum-video";

type Player = { destroy(): void };
type YouTubeApi = {
  Player: new (frame: HTMLIFrameElement, options: {
    events: { onReady(): void; onError(): void };
  }) => Player;
};
type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

let apiRequest: Promise<YouTubeApi> | null = null;

// Only this player needs the IFrame API (for playback errors, not video selection).
function loadPlayerApi(): Promise<YouTubeApi> {
  const host = window as YouTubeWindow;
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (apiRequest) return apiRequest;
  apiRequest = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = host.onYouTubeIframeAPIReady;
    const script = document.createElement("script");
    let settled = false;
    const finish = (api?: YouTubeApi) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (host.onYouTubeIframeAPIReady === ready) host.onYouTubeIframeAPIReady = previous;
      if (api?.Player) resolve(api);
      else {
        script.remove();
        reject(new Error("YouTube player unavailable"));
      }
    };
    const ready = () => {
      finish(host.YT);
      previous?.();
    };
    const timeout = window.setTimeout(() => finish(), 20_000);
    host.onYouTubeIframeAPIReady = ready;
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => finish();
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    apiRequest = null;
    throw error;
  });
  return apiRequest;
}

export function ConundrumVideoPlayer({ video }: { video: FrozenConundrumVideo }) {
  const mount = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const { embedUrl, title } = video;

  useEffect(() => {
    const container = mount.current;
    if (!container) return;
    let disposed = false;
    let player: Player | undefined;
    const timeout = window.setTimeout(() => unavailable(), 20_000);
    const unavailable = () => {
      if (disposed) return;
      window.clearTimeout(timeout);
      setStatus("unavailable");
    };
    const frame = document.createElement("iframe");
    const source = new URL(embedUrl);
    // Transport/player controls only: the frozen media identity is never changed.
    source.searchParams.set("enablejsapi", "1");
    source.searchParams.set("origin", window.location.origin);
    source.searchParams.set("playsinline", "1");
    source.searchParams.set("autoplay", "0");
    frame.src = source.toString();
    frame.title = title;
    frame.allow = "encrypted-media; fullscreen; picture-in-picture";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.className = "absolute inset-0 h-full w-full border-0";
    frame.onerror = unavailable;
    container.appendChild(frame);
    void loadPlayerApi().then((api) => {
      if (disposed) return;
      player = new api.Player(frame, {
        events: {
          onReady: () => {
            if (disposed) return;
            window.clearTimeout(timeout);
            setStatus("ready");
          },
          onError: unavailable,
        },
      });
    }).catch(unavailable);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      player?.destroy();
      container.replaceChildren();
    };
  }, [attempt, embedUrl, title]);

  return (
    <section className="review-surface min-w-0 overflow-hidden p-3 sm:p-5" aria-label="Conundrum video">
      <div ref={mount} className="relative aspect-video min-h-[200px] w-full overflow-hidden rounded-xl bg-black" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--review-muted)]" role="status">
          {status === "unavailable"
            ? "YouTube is unavailable right now. Retry the same video; your challenge and writing are unchanged."
            : status === "loading" ? "Loading the Conundrum video…" : "Play the video when you’re ready."}
        </p>
        <button type="button" className="review-secondary" onClick={() => {
          setStatus("loading");
          setAttempt((value) => value + 1);
        }}>Retry video</button>
      </div>
    </section>
  );
}
