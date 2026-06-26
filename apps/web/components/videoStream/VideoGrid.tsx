// components/video/VideoGrid.tsx

import type { VideoListEntry } from "../../types/index";
import { VideoCard } from "./VideoCard";

export function VideoGrid({ videos }: { videos: VideoListEntry[] }) {
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="text-[15px] font-medium text-[#F2F0EB]">No videos yet</p>
        <p className="text-[13px] text-[#8A8F98]">
          Upload one and it'll show up here once it finishes processing.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}