import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  ROUTE_PERMISSIONS,
  canVisitPath,
  firstAllowedPath,
  isPermission,
  permissionsForRole,
  roleFromClerkMetadata,
  roleHasPermission,
  type Permission,
  type Role,
} from "./roles";

// Matriz del contrato crew-auth, escrita aparte a proposito (no deriva de
// ROLE_PERMISSIONS) para que un cambio accidental falle aqui.
const MESERO: Permission[] = ["mesas.ver", "comanda.crear", "cuenta.ver", "cuenta.cobrar"];
const MATRIX: Record<Role, Permission[]> = {
  super: [...PERMISSIONS],
  cajero: [...MESERO, "caja.ver", "caja.resumen"],
  mesero: MESERO,
  cocina: ["cocina.ver"],
};

describe("matriz de permisos por rol", () => {
  it("los permisos del contrato son exactamente estos 11", () => {
    expect([...PERMISSIONS]).toEqual([
      "mesas.ver",
      "comanda.crear",
      "cuenta.ver",
      "cuenta.cobrar",
      "cocina.ver",
      "cocina.operar",
      "caja.ver",
      "caja.resumen",
      "ajustes.ver",
      "ajustes.impresoras",
      "usuarios.administrar",
    ]);
    expect([...ROLES]).toEqual(["super", "cajero", "mesero", "cocina"]);
  });

  it.each(ROLES)("rol %s tiene exactamente sus permisos", (role) => {
    expect([...ROLE_PERMISSIONS[role]].sort()).toEqual([...MATRIX[role]].sort());
    for (const p of PERMISSIONS) {
      expect(roleHasPermission(role, p)).toBe(MATRIX[role].includes(p));
    }
  });

  it("cocina solo lee: sin cocina.operar, sin cobrar ni caja", () => {
    expect(roleHasPermission("cocina", "cocina.ver")).toBe(true);
    expect(roleHasPermission("cocina", "cocina.operar")).toBe(false);
    expect(roleHasPermission("cocina", "cuenta.cobrar")).toBe(false);
  });

  it("solo super administra usuarios y ajustes", () => {
    for (const role of ROLES) {
      expect(roleHasPermission(role, "usuarios.administrar")).toBe(role === "super");
      expect(roleHasPermission(role, "ajustes.ver")).toBe(role === "super");
    }
  });

  it("permissionsForRole devuelve una copia", () => {
    const p = permissionsForRole("mesero");
    p.push("usuarios.administrar");
    expect(roleHasPermission("mesero", "usuarios.administrar")).toBe(false);
  });

  it("isPermission valida strings", () => {
    expect(isPermission("caja.ver")).toBe(true);
    expect(isPermission("caja.todo")).toBe(false);
    expect(isPermission(5)).toBe(false);
  });
});

describe("rol desde metadata de Clerk", () => {
  it("sin crewRole es super (cuentas actuales)", () => {
    expect(roleFromClerkMetadata(undefined)).toBe("super");
    expect(roleFromClerkMetadata(null)).toBe("super");
    expect(roleFromClerkMetadata({})).toBe("super");
    expect(roleFromClerkMetadata({ otra: 1 })).toBe("super");
  });
  it("lee publicMetadata.crewRole", () => {
    expect(roleFromClerkMetadata({ crewRole: "cajero" })).toBe("cajero");
    expect(roleFromClerkMetadata({ crewRole: "mesero" })).toBe("mesero");
  });
  it("un valor invalido nunca escala a super", () => {
    expect(roleFromClerkMetadata({ crewRole: "admin" })).toBe("cocina");
    expect(roleFromClerkMetadata({ crewRole: 7 })).toBe("cocina");
  });
});

describe("mapa ruta -> permiso", () => {
  it("coincide con el contrato", () => {
    expect(ROUTE_PERMISSIONS).toEqual({
      "/mesas": "mesas.ver",
      "/mesas/:unidad": "cuenta.ver",
      "/mesas/:unidad/comanda": "comanda.crear",
      "/cocina": "cocina.ver",
      "/caja": "caja.ver",
      "/caja/comprobantes": "caja.ver",
      "/caja/resumen": "caja.resumen",
      "/ajustes": "ajustes.ver",
      "/ajustes/impresoras": "ajustes.impresoras",
      "/ajustes/dispositivos": "ajustes.impresoras",
    });
  });
});

describe("vista inicial por rol", () => {
  const has = (role: Role) => (p: Permission) => roleHasPermission(role, p);
  it("cocina -> /cocina; mesero y cajero -> /mesas; super -> /mesas", () => {
    expect(firstAllowedPath(has("cocina"), "/mesas")).toBe("/cocina");
    expect(firstAllowedPath(has("mesero"), "/mesas")).toBe("/mesas");
    expect(firstAllowedPath(has("cajero"))).toBe("/mesas");
    expect(firstAllowedPath(has("super"))).toBe("/mesas");
  });
  it("respeta la preferida si esta permitida", () => {
    expect(firstAllowedPath(has("super"), "/cocina")).toBe("/cocina");
  });
  it("mesero con preferida /cocina cae a /mesas", () => {
    expect(firstAllowedPath(has("mesero"), "/cocina")).toBe("/mesas");
  });
  it("sin permisos devuelve null", () => {
    expect(firstAllowedPath(() => false, "/mesas")).toBeNull();
  });
});

describe("canVisitPath", () => {
  const has = (role: Role) => (p: Permission) => roleHasPermission(role, p);
  it("casa rutas con parametros y respeta el permiso del rol", () => {
    expect(canVisitPath(has("mesero"), "/mesas")).toBe(true);
    expect(canVisitPath(has("mesero"), "/mesas/12")).toBe(true);
    expect(canVisitPath(has("mesero"), "/mesas/12/comanda?x=1")).toBe(true);
    expect(canVisitPath(has("mesero"), "/cocina")).toBe(false);
    expect(canVisitPath(has("mesero"), "/ajustes/impresoras")).toBe(false);
    expect(canVisitPath(has("cocina"), "/mesas/5")).toBe(false);
    expect(canVisitPath(has("cocina"), "/cocina/")).toBe(true);
    expect(canVisitPath(has("super"), "/caja/resumen")).toBe(true);
  });
  it("una ruta desconocida no cuenta como permitida", () => {
    expect(canVisitPath(has("super"), "/nada")).toBe(false);
  });
});
