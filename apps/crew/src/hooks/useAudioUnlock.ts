import { useEffect } from "react";
import { unlockAudio } from "../lib/sound";

// El navegador bloquea el audio hasta un toque; cualquier toque en la página lo desbloquea en silencio
export function useAudioUnlock(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onGesture = () => {
      unlockAudio();
    };
    document.addEventListener("click", onGesture, true);
    document.addEventListener("touchend", onGesture, true);
    return () => {
      document.removeEventListener("click", onGesture, true);
      document.removeEventListener("touchend", onGesture, true);
    };
  }, [enabled]);
}
