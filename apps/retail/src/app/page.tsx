import { getTranslations } from "next-intl/server";

// Sin sucursal no hay orden que mostrar: el QR siempre trae /{restaurante}/{sucursal}
export default async function Home() {
  const t = await getTranslations("HomePage");
  return (
    <div className="min-h-dvh bg-even-evergreen flex items-center justify-center px-5">
      <div className="w-full max-w-md text-center">
        <img
          src="/even/even-asterisk-grass.svg"
          alt="Even"
          className="size-16 md:size-20 mx-auto mb-6"
        />
        <h1 className="text-white text-xl md:text-2xl font-medium mb-2">{t("heroTitle")}</h1>
        <p className="text-white/80 text-sm md:text-base">{t("heroSubtitle")}</p>
      </div>
    </div>
  );
}
