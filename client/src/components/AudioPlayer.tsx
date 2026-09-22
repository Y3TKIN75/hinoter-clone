import { forwardRef } from 'react';

interface Props {
  src: string;
  onTimeUpdate: (sec: number) => void;
}

/** Yerel <audio> sarmalayıcısı; üst bileşen ref ile currentTime'ı ayarlayabilir. */
const AudioPlayer = forwardRef<HTMLAudioElement, Props>(function AudioPlayer({ src, onTimeUpdate }, ref) {
  return (
    <audio
      ref={ref}
      src={src}
      controls
      preload="metadata"
      className="w-full"
      onTimeUpdate={(e) => onTimeUpdate((e.target as HTMLAudioElement).currentTime)}
    />
  );
});

export default AudioPlayer;
