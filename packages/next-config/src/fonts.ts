import { DM_Mono, Plus_Jakarta_Sans } from "next/font/google";

// DM Mono — voz funcional de Even (UI, body, labels, datos)
export const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

// Plus Jakarta Sans — display (sustituto provisional de Noka para headlines)
export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});
