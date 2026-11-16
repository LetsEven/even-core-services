// Toast minimo sin React (el modo demo lo usa para avisos como "Impresion
// simulada"). Se apila arriba a la derecha y se quita solo.
const CONTAINER_ID = "demo-toasts";

export function demoToast(message: string, ms = 2800): void {
  if (typeof document === "undefined") return;
  let box = document.getElementById(CONTAINER_ID);
  if (!box) {
    box = document.createElement("div");
    box.id = CONTAINER_ID;
    box.setAttribute("role", "status");
    box.style.cssText =
      "position:fixed;top:56px;right:12px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.textContent = message;
  el.style.cssText =
    "background:#023828;color:#f4f1ea;border:1px solid #82e657;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:500;box-shadow:0 4px 14px rgba(0,0,0,.25);";
  box.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
