"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { UserCircle } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { lockScroll, unlockScroll } from "@/app/utils/scrollLock";

const AuthView = lazy(() => import("@/app/components/AuthView"));
const DashboardView = lazy(() => import("@/app/components/DashboardView"));

// Botón de cuenta del header y su panel (login o dashboard), igual que en Tap & Pay
export default function AccountMenu() {
  const { isAuthenticated, profile, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const close = (after?: () => void) => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      after?.();
    }, 380);
  };

  useEffect(() => {
    if (!open) return;
    lockScroll();
    return unlockScroll;
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Cuenta"
        className="size-10 md:size-12 lg:size-14 bg-white border border-tone-300 rounded-full flex items-center justify-center overflow-hidden cursor-pointer active:scale-95 transition-transform duration-200"
      >
        {isAuthenticated && profile?.photoUrl ? (
          <img src={profile.photoUrl} alt="" className="w-full h-full object-cover" />
        ) : isAuthenticated && profile?.firstName ? (
          <span className="text-even-evergreen font-semibold text-base md:text-lg lg:text-xl select-none">
            {profile.firstName.charAt(0).toUpperCase()}
          </span>
        ) : (
          <UserCircle className="text-warm-500 size-6 md:size-7 lg:size-8" strokeWidth={1.2} />
        )}
      </button>

      {open && (
        <div>
          <div
            className="fixed inset-0 z-1000 bg-black/30 backdrop-blur-sm"
            style={{
              animation: closing
                ? "accountFadeOut 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "accountFadeIn 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onClick={() => close()}
          />
          <div
            className="fixed inset-x-0 z-1000 flex flex-col rounded-t-3xl shadow-2xl border-t border-white/20"
            style={{
              top: "5%",
              bottom: 0,
              paddingBottom: "env(safe-area-inset-bottom)",
              background: "rgba(255, 255, 255, 0.82)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              animation: closing
                ? "accountSlideDown 0.38s cubic-bezier(0.32, 0.72, 0, 1) forwards"
                : "accountSlideUp 0.38s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-tone-300/80" />
            </div>
            <Suspense fallback={null}>
              {isAuthenticated && profile?.firstName ? (
                <div className="flex-1 min-h-0">
                  <DashboardView
                    onClose={() => close()}
                    onLogout={() => close(logout)}
                    initialTab="profile"
                  />
                </div>
              ) : (
                <AuthView onClose={() => close()} />
              )}
            </Suspense>
          </div>
          <style>{`
            @keyframes accountSlideUp {
              from { transform: translateY(100%); opacity: 0.6; }
              to   { transform: translateY(0);    opacity: 1; }
            }
            @keyframes accountSlideDown {
              from { transform: translateY(0);    opacity: 1; }
              to   { transform: translateY(100%); opacity: 0.6; }
            }
            @keyframes accountFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes accountFadeOut { from { opacity: 1; } to { opacity: 0; } }
          `}</style>
        </div>
      )}
    </>
  );
}
