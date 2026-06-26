"use client";

// components/video/HlsPlayer.tsx
//
// hls.js wrapped as a client component. Prioritizes hls.js over
// native canPlayType-based playback on purpose — recent Chrome
// versions report HLS support via canPlayType but don't always
// play every stream reliably through it, so Hls.isSupported() first
// is the more consistent default across browsers right now.

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

interface HlsPlayerProps {
  src: string;
  poster?: string;
}

export function HlsPlayer({ src, poster }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setIsReady(false);
    setErrorMessage(null);

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsReady(true);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setErrorMessage(`Playback error: ${data.details}`);
        }
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      return () => {
        hls.destroy();
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      const onLoaded = () => setIsReady(true);
      video.addEventListener("loadedmetadata", onLoaded);
      return () => video.removeEventListener("loadedmetadata", onLoaded);
    }

    setErrorMessage("This browser can't play HLS video.");
  }, [src]);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        controls
        playsInline
        poster={poster}
        className="h-full w-full"
      />

      {/* Signature loading beat — fills left-to-right while hls.js
          attaches, instead of a generic spinner. Echoes the
          pipeline's own "processing" framing. */}
      {!isReady && !errorMessage && (
        <div className="absolute bottom-0 left-0 h-[2px] w-full bg-white/10">
          <div className="h-full w-1/3 animate-[loading-sweep_1.1s_ease-in-out_infinite] bg-[#FF6A3D]" />
        </div>
      )}

      {errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 px-6 text-center">
          <p className="text-[14px] text-[#8A8F98]">{errorMessage}</p>
        </div>
      )}
    </div>
  );
}