// app/watch/[videoId]/page.tsx

import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchVideoById } from "../../../libs/api";
import { HlsPlayer } from "../../../components/videoStream/HlsPlayer";
import { formatFileSize, formatRelativeDate } from "../../../libs/video-display";

export default async function WatchPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const video = await fetchVideoById(videoId);

  if (!video) {
    notFound();
  }

  return (
    <div className="video-app">
      <header className="border-b border-white/5 px-6 py-5 sm:px-10">
        <Link
          href="/youtube"
          className="text-[13px] font-medium text-[#8A8F98] transition-colors hover:text-[#F2F0EB]"
        >
          ← All videos
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
        <HlsPlayer src={video.playbackUrl} />

        <div className="mt-5">
          <h1 className="text-[18px] font-semibold leading-snug text-[#F2F0EB]">
            {video.filename}
          </h1>
          <p className="mt-1 font-mono text-[13px] text-[#8A8F98]">
            {formatFileSize(video.filesize)} · {formatRelativeDate(video.createdAt)}
          </p>
        </div>
      </main>
    </div>
  );
}