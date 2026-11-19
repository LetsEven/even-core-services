"use client";

import type { AuthCopyOverrides } from "@even/ui/diner";
import { useTranslations } from "next-intl";

/** Tap Order & Pay conserva su subtítulo del login ("Te enviaremos un código de verificación"). */
export function useAuthLoginCopy(): AuthCopyOverrides {
  const t = useTranslations("Auth");
  return { phoneSubtitle: t("phoneStepSubtitle") };
}
