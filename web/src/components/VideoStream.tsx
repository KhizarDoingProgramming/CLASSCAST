import { useRef, useEffect } from 'react';

interface VideoStreamProps {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  label?: string;
}

export default function VideoStream({ stream, muted = false, className = '', label }: VideoStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  if (!stream) return null;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-contain"
      />
      {label && (
        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
          {label}
        </div>
      )}
    </div>
  );
}
