// Pantalla de error cuando el modo demo se niega a activarse (ej. API de
// produccion). Se monta en lugar de la app: no hay sesion ni datos.
export default function RefusalScreen({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="min-h-screen flex items-center justify-center bg-black px-6 text-center"
    >
      <div className="max-w-lg space-y-3 text-white">
        <h1 className="text-xl font-bold uppercase tracking-widest text-amber-400">
          Modo demo no disponible
        </h1>
        <p className="text-sm leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
