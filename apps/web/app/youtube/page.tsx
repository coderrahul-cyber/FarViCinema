// app/page.tsx

import { fetchVideoList } from "../../libs/api";
import { VideoGrid } from "../../components/videoStream/VideoGrid";

export default async function HomePage() {
  const { videos } = await fetchVideoList();

  return (
    <div className="video-app">
      <header className="border-b border-white/5 px-6 py-5 sm:px-10">
        <h1 className="text-[15px] font-semibold tracking-tight text-[#F2F0EB]">
          Videos
        </h1>
      </header>

      <main className="px-6 py-8 sm:px-10">
        <VideoGrid videos={videos} />
      </main>
    </div>
  );
}