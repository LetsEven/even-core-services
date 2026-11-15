import { lazy, Suspense, useState } from "react";
import { useClerkSignInForm } from "../lib/auth";
import { isDemoMode } from "../lib/demoMode";
import { Mail, KeyRound, Loader2, Eye, EyeOff } from "lucide-react";

const APP_LABEL = import.meta.env.VITE_APP_LABEL || "Even Crew";

// En modo demo (ver src/demo) no hay Clerk: pantalla con "Entrar al modo demo".
const DemoLogin = lazy(() => import("../demo/DemoLogin"));

export default function LoginPage() {
  if (isDemoMode()) {
    return (
      <Suspense fallback={null}>
        <DemoLogin />
      </Suspense>
    );
  }
  return <ClerkLoginForm />;
}

// Login del negocio (Clerk). Al completarse, el guard del router detecta la
// sesión y redirige a "/".
function ClerkLoginForm() {
  const { signIn, setActive } = useClerkSignInForm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signIn) return;

    setLoading(true);
    setError("");

    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });

      if (result.status === "complete") {
        await setActive!({ session: result.createdSessionId });
      } else {
        setError("Error al iniciar sesión. Intenta de nuevo.");
      }
    } catch (err: any) {
      const msg = err?.errors?.[0]?.message || "Credenciales incorrectas.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

    return (
      <div
        className="min-h-screen flex flex-col justify-center items-center px-6"
        style={{ background: "#023828" }}
      >
        <div className="w-full max-w-sm flex flex-col items-center">
          <div className="mb-8 flex flex-col items-center gap-3">
            <img
              src="/even/even-asterisk-grass.svg"
              alt="Even"
              className="w-16 h-16"
            />
            <h1 className="text-even-offwhite text-2xl font-medium uppercase tracking-widest">
              {APP_LABEL}
            </h1>
            <p className="text-even-offwhite/60 text-xs uppercase tracking-widest">
              Inicia sesión para continuar
            </p>
          </div>

          <form onSubmit={handleSubmit} className="w-full space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-even-offwhite/40 pointer-events-none" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Email"
                autoComplete="username email"
                className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-md text-even-offwhite placeholder:text-even-offwhite/30 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent"
              />
            </div>

            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-even-offwhite/40 pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Contraseña"
                autoComplete="current-password"
                className="w-full pl-10 pr-10 py-3 bg-white/10 border border-white/20 rounded-md text-even-offwhite placeholder:text-even-offwhite/30 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-transparent [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-even-offwhite/40 hover:text-even-offwhite/70 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            {error && <p className="text-rose-400 text-sm px-1">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full py-3 rounded-md text-even-evergreen font-medium text-sm uppercase tracking-widest transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              style={{ background: "#82E657" }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Entrando..." : "Iniciar sesión"}
            </button>
          </form>
        </div>
      </div>
    );
}
