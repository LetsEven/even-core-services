import { loadSharedMessages, mergeMessages } from "@even/i18n";
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  negotiateLocale,
} from "@even/i18n/locale";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  let locale = DEFAULT_LOCALE;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const headersList = await headers();
    locale = negotiateLocale(headersList.get("accept-language"));
  }

  return {
    locale,
    messages: mergeMessages(
      await loadSharedMessages(locale),
      (await import(`../messages/${locale}.json`)).default,
    ),
  };
});
