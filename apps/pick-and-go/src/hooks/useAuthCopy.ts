"use client";

import type { AuthCopyOverrides } from "@even/ui/diner";
import { useTranslations } from "next-intl";

/**
 * Textos propios de Pick & Go para el acceso de `auth-selection`: aquí es solo inicio de sesión (sin "invitado"),
 * con otro título y el subtítulo genérico del código. Los usan la pantalla y su esqueleto de la transición.
 */
export function useAuthSelectionCopy(): AuthCopyOverrides {
  const t = useTranslations("Auth");
  return {
    phoneTitle: t("phoneStepTitleAlt"),
    phoneSubtitle: t("phoneStepSubtitle"),
    phoneCta: t("sendCode"),
    profileTitle: t("profileStepTitleAlt"),
  };
}

/** El `auth` de Pick & Go conserva su subtítulo ("Te enviaremos un código de verificación"). */
export function useAuthLoginCopy(): AuthCopyOverrides {
  const t = useTranslations("Auth");
  return { phoneSubtitle: t("phoneStepSubtitle") };
}
