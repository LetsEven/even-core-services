import type { Metadata } from "next";
import { dmMono, jakarta } from "@even/next-config/fonts";
import { buildRootMetadata, evenAsteriskIcons } from "@even/next-config/metadata";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import TermsUpdateToast from "@/components/TermsUpdateToast";
import { RestaurantProvider } from "@/context/RestaurantContext";
import { RoomProvider } from "@/context/RoomContext";
import { CartProvider } from "@/context/CartContext";
import { UserDataProvider } from "@/context/userDataContext";
import { GuestProvider } from "@/context/GuestContext";
import { PaymentProvider } from "@/context/PaymentContext";
import { PepperProvider } from "@/context/PepperContext";
import Script from "next/script";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RootLayout");
  const title = t("title");
  const description = t("description");
  return buildRootMetadata({
    metadataBase: "https://rs.letseven.io",
    siteName: "Even Room Service",
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
            <RestaurantProvider>
              <CartProvider>
                <PepperProvider>
                  <RoomProvider>
                    <GuestProvider>
                      <PaymentProvider>
                        <UserDataProvider>{children}</UserDataProvider>
                      </PaymentProvider>
                    </GuestProvider>
                  </RoomProvider>
                </PepperProvider>
              </CartProvider>
            </RestaurantProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
