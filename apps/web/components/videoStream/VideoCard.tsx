// components/video/VideoCard.tsx

import Link from "next/link";
import type { VideoListEntry } from "../../types/index";
import { gradientForId, formatFileSize, formatDuration, formatRelativeDate } from "../../libs/video-display";

export function VideoCard({ video }: { video: VideoListEntry }) {
  const duration = formatDuration(video.duration);

  return (
    <Link
      href={`/watch/${video.id}`}
      className="group block focus:outline-none"
    >
      <div
        className="relative aspect-video w-full overflow-hidden rounded-md ring-1 ring-white/5 transition-all duration-200 group-hover:ring-[#FF6A3D]/40 group-focus-visible:ring-2 group-focus-visible:ring-[#FF6A3D]"
        style={{ background: gradientForId(video.id) }}
      >
        {/* Play affordance on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-[#F2F0EB]" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {duration && (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[#F2F0EB]">
            {duration}
          </span>
        )}
      </div>

      <div className="mt-2.5 flex flex-col gap-0.5">
        <h3 className="line-clamp-2 text-[14px] font-medium leading-snug text-[#F2F0EB]">
          {video.filename}
        </h3>
        <p className="font-mono text-[12px] text-[#8A8F98]">
          {formatFileSize(video.filesize)} · {formatRelativeDate(video.createdAt)}
        </p>
      </div>
    </Link>
  );
}