import type { Metadata } from "next";
import { dmMono, jakarta } from "@even/next-config/fonts";
import { buildRootMetadata } from "@even/next-config/metadata";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { GuestProvider } from "@/context/GuestContext";
import { RestaurantProvider } from "@/context/RestaurantContext";
import { BranchProvider } from "@/context/BranchContext";
import { CartProvider } from "@/context/CartContext";
import { PickAndGoProvider } from "@/context/PickAndGoContext";
import { UserDataProvider } from "@/context/userDataContext";
import { PaymentProvider } from "@/context/PaymentContext";
import { PepperProvider } from "@/context/PepperContext";
import AuthCartSync from "@/components/AuthCartSync";
import TermsUpdateToast from "@/components/TermsUpdateToast";
import EnvBadge from "@/components/EnvBadge";
import EcartPaySdk from "@/components/EcartPaySdk";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RootLayout");
  const title = t("title");
  const description = t("description");
  return buildRootMetadata({
    metadataBase: "https://pg.letseven.io",
    siteName: "Even Pick & Go",
    title,
    description,
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
        <EcartPaySdk />
        <EnvBadge />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <TermsUpdateToast />
            <GuestProvider>
              <BranchProvider>
                <RestaurantProvider>
                  <CartProvider>
                    <AuthCartSync />
                    <PepperProvider>
                      <PickAndGoProvider>
                        <PaymentProvider>
                          <UserDataProvider>{children}</UserDataProvider>
                        </PaymentProvider>
                      </PickAndGoProvider>
                    </PepperProvider>
                  </CartProvider>
                </RestaurantProvider>
              </BranchProvider>
            </GuestProvider>
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
