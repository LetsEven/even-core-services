import type { Metadata } from "next";
import { dmMono, jakarta } from "@even/next-config/fonts";
import { buildRootMetadata, evenAsteriskIcons } from "@even/next-config/metadata";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "@/app/context/AuthContext";
import TermsUpdateToast from "@/app/components/TermsUpdateToast";
import { RestaurantProvider } from "@/app/context/RestaurantContext";
import { TableProvider } from "@/app/context/TableContext";
import { PaymentProvider } from "@/app/context/PaymentContext";
import { GuestProvider } from "./context/GuestContext";
import { SocketProvider } from "./context/SocketContext";
import Script from "next/script";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RootLayout");
  const title = t("title");
  const description = t("description");
  return buildRootMetadata({
    metadataBase: "https://tp.letseven.io",
    siteName: "Even Tap & Pay",
    title,
    description,
    icons: evenAsteriskIcons,
  });
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;
  void nonce;

  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        className={`${dmMono.variable} ${jakarta.variable} antialiased`}
        style={{ fontFamily: "var(--font-dm-mono)" }}
      >
        <Script
          src="https://pay.ecart.com/sdk/pay.js"
          strategy="afterInteractive"
        />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <TermsUpdateToast />
            <GuestProvider>
              <RestaurantProvider>
                <SocketProvider>
                  <TableProvider>
                    <PaymentProvider>{children}</PaymentProvider>
                  </TableProvider>
                </SocketProvider>
              </RestaurantProvider>
            </GuestProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
