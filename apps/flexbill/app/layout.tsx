import type { Metadata, Viewport } from "next";
import { dmMono, jakarta } from "@even/next-config/fonts";
import { buildRootMetadata } from "@even/next-config/metadata";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { brandColors } from "@even/ui";
import { CartProvider } from "./context/CartContext";
import { TableProvider } from "./context/TableContext";
import { GuestProvider } from "./context/GuestContext";
import { PaymentProvider } from "./context/PaymentContext";
import { RestaurantProvider } from "./context/RestaurantContext";
import { AuthProvider } from "./context/AuthContext";
import TermsUpdateToast from "@/app/components/TermsUpdateToast";
import { SocketProvider } from "./context/SocketContext";
import { PepperProvider } from "./context/PepperContext";
import Script from "next/script";
import { headers } from "next/headers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RootLayout");
  const title = t("title");
  const description = t("description");
  return buildRootMetadata({
    metadataBase: "https://fb.letseven.io",
    siteName: "Even Flex Bill",
    title,
    description,
  });
}

export const viewport: Viewport = {
  themeColor: brandColors.white,
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-visual",
};

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
            <RestaurantProvider>
              <PepperProvider>
                <GuestProvider>
                  <SocketProvider>
                    <CartProvider>
                      <TableProvider>
                        <PaymentProvider>{children}</PaymentProvider>
                      </TableProvider>
                    </CartProvider>
                  </SocketProvider>
                </GuestProvider>
              </PepperProvider>
            </RestaurantProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
