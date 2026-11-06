import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import {
  isAudioUnlocked,
  onAudioStateChange,
  unlockAudio,
} from "../lib/sound";

// Solo web: Safari no suena hasta que el usuario toca la pantalla, y vuelve a bloquearse al regresar de segundo plano
export default function SoundUnlockBanner() {
  const [unlocked, setUnlocked] = useState(isAudioUnlocked);

  useEffect(() => {
    const sync = () => setUnlocked(isAudioUnlocked());
    const unsubscribe = onAudioStateChange(sync);
    const onGesture = () => {
      unlockAudio();
    };
    document.addEventListener("click", onGesture, true);
    document.addEventListener("touchend", onGesture, true);
    return () => {
      unsubscribe();
      document.removeEventListener("click", onGesture, true);
      document.removeEventListener("touchend", onGesture, true);
    };
  }, []);

  if (unlocked) return null;

  return (
    <button
      onClick={() => unlockAudio()}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-even-grass text-even-evergreen text-xs uppercase tracking-wider font-medium shadow-lg cursor-pointer"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <Volume2 className="w-4 h-4" />
      Toca para activar el sonido de órdenes
    </button>
  );
}
