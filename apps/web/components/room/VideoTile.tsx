// 'use client'

// import { useEffect, useRef } from 'react'
// import type { Participant }  from '../../types/index'

// interface VideoTileProps {
//   participant: Participant
//   large?:      boolean
// }

// export const VideoTile = ({ participant, large = false }: VideoTileProps) => {
//   const videoRef = useRef<HTMLVideoElement>(null)

//   useEffect(() => {
//     const el = videoRef.current
//     if (!el) return
//     if (participant.stream) {
//       el.srcObject = participant.stream
//     }
//   }, [participant.stream])

//   const initials = participant.name
//     .split(' ')
//     .map(w => w[0])
//     .join('')
//     .toUpperCase()
//     .slice(0, 2)

//   return (
//     <div className={`relative rounded-xl overflow-hidden bg-panel border border-border group
//       ${large ? 'aspect-video' : 'aspect-video'}`}>

//       {/* Video */}
//       {participant.stream && !participant.videoOff ? (
//         <video
//           ref={videoRef}
//           autoPlay
//           playsInline
//           muted={participant.isLocal}
//           className="w-full h-full object-cover"
//           style={{ transform: participant.isLocal ? 'scaleX(-1)' : 'none' }}
//         />
//       ) : (
//         // Avatar fallback when video is off
//         <div className="w-full h-full flex items-center justify-center bg-panel">
//           <div className="w-16 h-16 rounded-full bg-border flex items-center justify-center">
//             <span className="font-display text-xl text-accent font-bold">{initials}</span>
//           </div>
//         </div>
//       )}

//       {/* Scan line overlay for depth */}
//       <div className="absolute inset-0 pointer-events-none"
//         style={{
//           background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
//         }}
//       />

//       {/* Bottom info bar */}
//       <div className="absolute bottom-0 left-0 right-0 px-3 py-2
//         bg-gradient-to-t from-void/90 to-transparent
//         flex items-center justify-between
//         translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100
//         transition-all duration-200">
//         <span className="font-mono text-xs text-accent truncate">
//           {participant.isLocal ? `${participant.name} (you)` : participant.name}
//         </span>
//         <div className="flex items-center gap-1.5">
//           {participant.audioMuted && (
//             <span className="text-danger" title="Muted">
//               <MicOffIcon />
//             </span>
//           )}
//           {participant.videoOff && (
//             <span className="text-warn" title="Video off">
//               <VideoOffIcon />
//             </span>
//           )}
//         </div>
//       </div>

//       {/* Speaking indicator */}
//       {!participant.audioMuted && !participant.isLocal && (
//         <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent animate-pulse-ring" />
//       )}

//       {/* Local badge */}
//       {participant.isLocal && (
//         <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-void/70 border border-accent/30">
//           <span className="font-mono text-xs text-accent">YOU</span>
//         </div>
//       )}
//     </div>
//   )
// }

// // ── Inline icons ──────────────────────────────────────────────────────────────

// const MicOffIcon = () => (
//   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//     <line x1="1" y1="1" x2="23" y2="23"/>
//     <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
//     <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
//     <line x1="12" y1="19" x2="12" y2="23"/>
//     <line x1="8" y1="23" x2="16" y2="23"/>
//   </svg>
// )

// const VideoOffIcon = () => (
//   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//     <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34"/>
//     <path d="M23 7l-7 5 7 5V7z"/>
//     <line x1="1" y1="1" x2="23" y2="23"/>
//   </svg>
// )


// audio attaching

// 'use client'

// import { useEffect, useRef } from 'react'
// import type { Participant }  from '../../types'

// interface VideoTileProps {
//   participant: Participant
// }

// export const VideoTile = ({ participant }: VideoTileProps) => {
//   const videoRef = useRef<HTMLVideoElement>(null)
//   const audioRef = useRef<HTMLAudioElement>(null)

//   // Attach video stream
//   useEffect(() => {
//     const el = videoRef.current
//     if (!el || !participant.stream) return
//     el.srcObject = participant.stream
//   }, [participant.stream])

//   // Attach audio stream separately for remote participants
//   // We do this separately so we can keep video muted (no echo)
//   // while still playing remote audio
//   useEffect(() => {
//     const el = audioRef.current
//     if (!el || !participant.audioStream || participant.isLocal) return
//     el.srcObject = participant.audioStream
//   }, [participant.audioStream, participant.isLocal])

//   const initials = participant.name
//     .split(' ')
//     .map(w => w[0])
//     .join('')
//     .toUpperCase()
//     .slice(0, 2)

//   return (
//     <div className="relative rounded-xl overflow-hidden bg-panel border border-border group aspect-video">

//       {/* Video */}
//       {participant.stream && !participant.videoOff ? (
//         <video
//           ref={videoRef}
//           autoPlay
//           playsInline
//           muted  // always mute video element — audio comes from <audio> tag below
//           className="w-full h-full object-cover"
//           style={{ transform: participant.isLocal ? 'scaleX(-1)' : 'none' }}
//         />
//       ) : (
//         <div className="w-full h-full flex items-center justify-center bg-panel">
//           <div className="w-16 h-16 rounded-full bg-border flex items-center justify-center">
//             <span className="font-display text-xl text-accent font-bold">{initials}</span>
//           </div>
//         </div>
//       )}

//       {/* Hidden audio element for remote participants — this is what you actually HEAR */}
//       {!participant.isLocal && (
//         <audio
//           ref={audioRef}
//           autoPlay
//           playsInline
//           // NOT muted — this is how remote audio plays
//         />
//       )}

//       {/* Scan line overlay */}
//       <div className="absolute inset-0 pointer-events-none"
//         style={{
//           background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
//         }}
//       />

//       {/* Bottom info bar */}
//       <div className="absolute bottom-0 left-0 right-0 px-3 py-2
//         bg-gradient-to-t from-void/90 to-transparent
//         flex items-center justify-between
//         translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100
//         transition-all duration-200">
//         <span className="font-mono text-xs text-accent truncate">
//           {participant.isLocal ? `${participant.name} (you)` : participant.name}
//         </span>
//         <div className="flex items-center gap-1.5">
//           {participant.audioMuted && (
//             <span className="text-danger" title="Muted">
//               <MicOffIcon />
//             </span>
//           )}
//           {participant.videoOff && (
//             <span className="text-warn" title="Video off">
//               <VideoOffIcon />
//             </span>
//           )}
//         </div>
//       </div>

//       {/* Speaking indicator — only show for remote unmuted participants */}
//       {!participant.isLocal && !participant.audioMuted && (
//         <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent animate-pulse-ring" />
//       )}

//       {/* Local badge */}
//       {participant.isLocal && (
//         <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-void/70 border border-accent/30">
//           <span className="font-mono text-xs text-accent">YOU</span>
//         </div>
//       )}
//     </div>
//   )
// }

// const MicOffIcon = () => (
//   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//     <line x1="1" y1="1" x2="23" y2="23"/>
//     <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
//     <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
//     <line x1="12" y1="19" x2="12" y2="23"/>
//     <line x1="8" y1="23" x2="16" y2="23"/>
//   </svg>
// )

// const VideoOffIcon = () => (
//   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//     <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34"/>
//     <path d="M23 7l-7 5 7 5V7z"/>
//     <line x1="1" y1="1" x2="23" y2="23"/>
//   </svg>
// )


'use client'

import { useEffect, useRef } from 'react'
import type { Participant }  from '../../types'

interface VideoTileProps {
  participant: Participant
}

export const VideoTile = ({ participant }: VideoTileProps) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Attach video stream
  useEffect(() => {
    const el = videoRef.current
    if (!el || !participant.stream) return
    el.srcObject = participant.stream
  }, [participant.stream])

  // Attach audio stream separately for remote participants.
  // We keep the <video> muted and play audio through a separate <audio> element
  // to avoid echo on the local speaker.
  // IMPORTANT: must call .play() explicitly after setting srcObject.
  // Browsers do not auto-play when srcObject is assigned programmatically after mount,
  // even when the <audio> element has the autoPlay attribute.
  useEffect(() => {
    const el = audioRef.current
    if (!el || !participant.audioStream || participant.isLocal) return
    el.srcObject = participant.audioStream
    // play() returns a Promise — catch the NotAllowedError if autoplay is blocked.
    // This happens on first load before any user gesture. After the user clicks
    // "Join" (a gesture), subsequent play() calls succeed.
    el.play().catch(err => {
      console.warn('[VideoTile] Audio autoplay blocked:', err.message)
      // Retry on next user interaction with the page
      const resume = () => { el.play().catch(() => {}); document.removeEventListener('click', resume) }
      document.addEventListener('click', resume, { once: true })
    })
  }, [participant.audioStream, participant.isLocal])

  const initials = participant.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="relative rounded-xl overflow-hidden bg-panel border border-border group aspect-video">

      {/* Video */}
      {participant.stream && !participant.videoOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted  // always mute video element — audio comes from <audio> tag below
          className="w-full h-full object-cover"
          style={{ transform: participant.isLocal ? 'scaleX(-1)' : 'none' }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-panel">
          <div className="w-16 h-16 rounded-full bg-border flex items-center justify-center">
            <span className="font-display text-xl text-accent font-bold">{initials}</span>
          </div>
        </div>
      )}

      {/* Hidden audio element for remote participants — this is what you actually HEAR */}
      {!participant.isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          // NOT muted — this is how remote audio plays
        />
      )}

      {/* Scan line overlay */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
        }}
      />

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 px-3 py-2
        bg-gradient-to-t from-void/90 to-transparent
        flex items-center justify-between
        translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100
        transition-all duration-200">
        <span className="font-mono text-xs text-accent truncate">
          {participant.isLocal ? `${participant.name} (you)` : participant.name}
        </span>
        <div className="flex items-center gap-1.5">
          {participant.audioMuted && (
            <span className="text-danger" title="Muted">
              <MicOffIcon />
            </span>
          )}
          {participant.videoOff && (
            <span className="text-warn" title="Video off">
              <VideoOffIcon />
            </span>
          )}
        </div>
      </div>

      {/* Speaking indicator — only show for remote unmuted participants */}
      {!participant.isLocal && !participant.audioMuted && (
        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent animate-pulse-ring" />
      )}

      {/* Local badge */}
      {participant.isLocal && (
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-void/70 border border-accent/30">
          <span className="font-mono text-xs text-accent">YOU</span>
        </div>
      )}
    </div>
  )
}

const MicOffIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="1" y1="1" x2="23" y2="23"/>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
)

const VideoOffIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34"/>
    <path d="M23 7l-7 5 7 5V7z"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
)