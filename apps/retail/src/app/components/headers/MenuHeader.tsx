"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

interface MenuHeaderProps {
  showBackButton?: boolean;
  // Contenido del lado izquierdo cuando no hay botón de regresar.
  leftSlot?: ReactNode;
}

export default function MenuHeader({ showBackButton = true, leftSlot }: MenuHeaderProps) {
  const router = useRouter();

  return (
    <header
      className="container mx-auto px-5 md:px-8 lg:px-10 pt-5 md:pt-7 lg:pt-9 relative"
      style={{ zIndex: 100 }}
    >
      <div className="relative flex items-center justify-between z-10">
        <div className="flex items-center z-10">
          {showBackButton ? (
            <div
              onClick={() => router.back()}
              className="size-10 md:size-12 lg:size-14 bg-white border border-tone-300 rounded-full flex items-center justify-center cursor-pointer hover:bg-tone-200 active:scale-95 transition-transform duration-200"
            >
              <ChevronLeft className="text-primary size-5 md:size-6 lg:size-7" />
            </div>
          ) : (
            (leftSlot ?? <div className="size-10 md:size-12 lg:size-14" />)
          )}
        </div>

        <div className="absolute left-1/2 transform -translate-x-1/2 size-10 md:size-12 lg:size-14">
          <img src="/even/even-asterisk-grass.svg" alt="Even" />
        </div>

        {/* En Tap & Pay aquí van los participantes de la mesa; Retail tiene un solo pagador */}
        <div className="size-10 md:size-12 lg:size-14" />
      </div>
    </header>
  );
}
