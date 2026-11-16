/**
 * Pantalla blanca mientras carga el detalle de producto (sin esqueleto). La foto y la
 * hoja en vuelo desde el menú (`DishFlight`) van por encima y hacen de portada hasta
 * que el contenido real está listo.
 */
export function DishLoadingShell() {
  return <div className="h-dvh bg-white" />;
}
