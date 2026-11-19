import { describe, expect, it } from "vitest";
import {
  ageFromBirthDate,
  birthDateFromAge,
  formatPhoneInput,
  formatPhoneNumber,
  isProfileComplete,
  unwrapProfile,
} from "./phone";

describe("formato de teléfono", () => {
  it("agrupa mientras se escribe y corta a 10 dígitos", () => {
    expect(formatPhoneInput("55")).toBe("55");
    expect(formatPhoneInput("5512")).toBe("551 2");
    expect(formatPhoneInput("5512345678")).toBe("551 234 5678");
    expect(formatPhoneInput("55123456789999")).toBe("551 234 5678");
    expect(formatPhoneInput("(55) 12-ab")).toBe("551 2");
  });

  it("muestra el número completo con o sin lada", () => {
    expect(formatPhoneNumber("5512345678")).toBe("551 234 5678");
    expect(formatPhoneNumber("+525512345678")).toBe("+52 (551) 234-5678");
    expect(formatPhoneNumber("123")).toBe("123");
    expect(formatPhoneNumber("")).toBe("");
  });
});

describe("edad y perfil", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("convierte edad en fecha de nacimiento y de vuelta", () => {
    expect(birthDateFromAge(30, now)).toBe("1996-01-01");
    expect(ageFromBirthDate("1996-01-01", now)).toBe(30);
    expect(ageFromBirthDate(undefined, now)).toBe("");
    expect(ageFromBirthDate("no-es-fecha", now)).toBe("");
  });

  it("perfil completo = nombre y fecha de nacimiento", () => {
    expect(isProfileComplete({ firstName: "Ana", birthDate: "1996-01-01" })).toBe(true);
    expect(isProfileComplete({ firstName: "Ana" })).toBe(false);
    expect(isProfileComplete(null)).toBe(false);
  });

  it("desenvuelve las formas en que el backend entrega el perfil", () => {
    expect(unwrapProfile({ data: { profile: { firstName: "A" } } })).toEqual({ firstName: "A" });
    expect(unwrapProfile({ profile: { firstName: "B" } })).toEqual({ firstName: "B" });
    expect(unwrapProfile({ data: { firstName: "C" } })).toEqual({ firstName: "C" });
    expect(unwrapProfile({ firstName: "D" })).toEqual({ firstName: "D" });
    expect(unwrapProfile(null)).toBeNull();
  });
});
