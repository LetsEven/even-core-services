// AudioContext compartido: iOS solo lo deja sonar si se reanudó dentro de un toque del usuario
let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();

function getCtx(): AudioContext {
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
    ctx.onstatechange = () => listeners.forEach((fn) => fn());
  }
  return ctx;
}

export function isAudioUnlocked(): boolean {
  return ctx?.state === "running";
}

export function onAudioStateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function unlockAudio(): Promise<void> {
  try {
    const c = getCtx();
    if (c.state !== "running") await c.resume();
  } catch {
    /* sin audio disponible */
  }
  listeners.forEach((fn) => fn());
}

export function playNotificationSound(): void {
  try {
    const c = getCtx();
    if (c.state !== "running") c.resume().catch(() => {});
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.4, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.6);
  } catch {
    /* sin audio disponible */
  }
}
