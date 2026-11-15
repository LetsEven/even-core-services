import { invoke } from "@tauri-apps/api/core";
import { isDemoMode } from "./demoMode";

// invoke de Tauri para comandos de impresora. En modo demo no hay shell nativo:
// el comando se simula (toast + registro en consola) con codigo cargado bajo
// demanda desde src/demo.
export async function invokeNative<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isDemoMode()) {
    const { simulateNativeInvoke } = await import("../demo/print");
    return (await simulateNativeInvoke(cmd, args)) as T;
  }
  return invoke<T>(cmd, args);
}
