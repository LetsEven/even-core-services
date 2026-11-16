// Datos ficticios del modo demo: restaurante "Mariscos Mazatlan" (id 26).
// Todo es inventado; nada de esto existe en ningun backend.
import type { Branch, MenuSection, PrinterRecord } from "../services/api";

export const DEMO_RESTAURANT_ID = 26;
export const DEMO_RESTAURANT_NAME = "Mariscos Mazatlán";
export const DEMO_BRANCH_ID = "demo-branch-1";
export const DEMO_BRANCH_NUMBER = 1;

// Slugs de clients.services: Flex Bill y Tap Order & Pay.
export const DEMO_BRANCH: Branch = {
  id: DEMO_BRANCH_ID,
  name: "Mariscos Mazatlán - Centro",
  branch_number: DEMO_BRANCH_NUMBER,
  restaurant_id: DEMO_RESTAURANT_ID,
  max_pending_orders: null,
  tap_pay_print: true,
  services: ["flex-bill", "tap-order-pay"],
};

// Contraseña vacia: en demo se entra con solo elegir el nombre.
export const DEMO_WAITERS: { id: string; name: string; password: string }[] = [
  { id: "101", name: "Luis Hernández", password: "" },
  { id: "102", name: "Marisol Pérez", password: "" },
  { id: "103", name: "Carlos Ruiz", password: "" },
];

export const DEMO_TABLE_NUMBERS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
] as const;

// Mesa fuera de servicio.
export const DEMO_MAINTENANCE_TABLE = "10";
// Mesa con un ticket abierto directo en el POS (se puede "traer" a Even).
export const DEMO_POS_TABLE = "11";

export function demoPrinters(nowIso: string): PrinterRecord[] {
  const base = {
    branch_id: DEMO_BRANCH_ID,
    port: 9100,
    is_active: true,
    last_seen_at: nowIso,
    connection_type: "wifi" as const,
    usb_device_name: null,
  };
  return [
    { ...base, id: "demo-printer-kitchen", ip: "192.168.1.50", name: "Cocina", role: "kitchen" },
    { ...base, id: "demo-printer-bar", ip: "192.168.1.51", name: "Barra", role: "bar" },
    { ...base, id: "demo-printer-pay", ip: "192.168.1.52", name: "Pagos", role: "payment" },
  ];
}

// clasificacion del backend: 1 = barra, 2 = cocina, 3 = otros.
export const CLASSIFICATION_BY_SECTION: Record<number, number> = {
  1: 2,
  2: 2,
  3: 2,
  4: 1,
};

export const DEMO_MENU: MenuSection[] = [
  {
    id: 1,
    name: "Entradas",
    is_active: true,
    display_order: 1,
    items: [
      {
        id: 101,
        name: "Ceviche de camarón",
        price: 145,
        display_price: 145,
        discount: 0,
        is_available: true,
        section_id: 1,
        image_url: null,
        custom_fields: [
          {
            id: "cf-ceviche-extras",
            name: "Extras",
            type: "checkboxes",
            required: false,
            maxSelections: 3,
            options: [
              { id: "opt-aguacate", name: "Aguacate", price: 25 },
              { id: "opt-tostadas", name: "Tostadas extra", price: 15 },
              { id: "opt-pulpo", name: "Pulpo", price: 45 },
            ],
          },
        ],
      },
      {
        id: 102,
        name: "Aguachile verde",
        price: 160,
        display_price: 160,
        discount: 0,
        is_available: true,
        section_id: 1,
        image_url: null,
        custom_fields: [
          {
            id: "cf-aguachile-picor",
            name: "Nivel de picor",
            type: "dropdown",
            required: true,
            options: [
              { id: "opt-suave", name: "Suave", price: 0 },
              { id: "opt-medio", name: "Medio", price: 0 },
              { id: "opt-picoso", name: "Picoso", price: 0 },
            ],
          },
        ],
      },
      {
        id: 103,
        name: "Coctel de camarón",
        price: 170,
        display_price: 170,
        discount: 10,
        is_available: true,
        section_id: 1,
        image_url: null,
        custom_fields: [],
      },
      {
        id: 104,
        name: "Callo de hacha",
        price: 190,
        display_price: 190,
        discount: 0,
        is_available: true,
        is_out_of_stock: true,
        section_id: 1,
        image_url: null,
        custom_fields: [],
      },
    ],
  },
  {
    id: 2,
    name: "Platos fuertes",
    is_active: true,
    display_order: 2,
    items: [
      {
        id: 201,
        name: "Pescado zarandeado",
        price: 320,
        display_price: 320,
        discount: 0,
        is_available: true,
        section_id: 2,
        image_url: null,
        custom_fields: [
          {
            id: "cf-zarandeado-guarnicion",
            name: "Guarnición",
            type: "dropdown",
            required: true,
            options: [
              { id: "opt-arroz", name: "Arroz", price: 0 },
              { id: "opt-ensalada", name: "Ensalada", price: 0 },
              { id: "opt-papas", name: "Papas a la francesa", price: 20 },
              { id: "opt-tortillas", name: "Tortillas de harina", price: 0, agotado: true },
            ],
          },
          {
            id: "cf-zarandeado-extras",
            name: "Extras",
            type: "checkboxes",
            required: false,
            maxSelections: 2,
            options: [
              { id: "opt-salsa", name: "Salsa macha", price: 15 },
              { id: "opt-limon", name: "Limones extra", price: 0 },
            ],
          },
        ],
      },
      {
        id: 202,
        name: "Camarones al mojo de ajo",
        price: 240,
        display_price: 240,
        discount: 0,
        is_available: true,
        section_id: 2,
        image_url: null,
        custom_fields: [],
      },
      {
        id: 203,
        name: "Filete empanizado",
        price: 210,
        display_price: 210,
        discount: 0,
        is_available: true,
        section_id: 2,
        image_url: null,
        custom_fields: [],
      },
      {
        id: 204,
        name: "Mojarra frita",
        price: 195,
        display_price: 195,
        discount: 0,
        is_available: true,
        section_id: 2,
        image_url: null,
        custom_fields: [],
      },
    ],
  },
  {
    id: 3,
    name: "Tacos y tostadas",
    is_active: true,
    display_order: 3,
    items: [
      {
        id: 301,
        name: "Taco gobernador",
        price: 65,
        display_price: 65,
        discount: 0,
        is_available: true,
        section_id: 3,
        image_url: null,
        custom_fields: [
          {
            id: "cf-taco-salsas",
            name: "Salsas",
            type: "dropdown-quantity",
            required: false,
            options: [
              { id: "opt-salsa-verde", name: "Salsa verde", price: 0 },
              { id: "opt-salsa-roja", name: "Salsa roja", price: 0 },
              { id: "opt-queso", name: "Queso extra", price: 12 },
            ],
          },
        ],
      },
      {
        id: 302,
        name: "Taco de pescado",
        price: 55,
        display_price: 55,
        discount: 0,
        is_available: true,
        section_id: 3,
        image_url: null,
        custom_fields: [],
      },
      {
        id: 303,
        name: "Tostada de pulpo",
        price: 85,
        display_price: 85,
        discount: 0,
        is_available: true,
        section_id: 3,
        image_url: null,
        custom_fields: [],
      },
    ],
  },
  {
    id: 4,
    name: "Bebidas",
    is_active: true,
    display_order: 4,
    items: [
      {
        id: 401,
        name: "Agua de jamaica",
        price: 45,
        display_price: 45,
        discount: 0,
        is_available: true,
        section_id: 4,
        image_url: null,
        custom_fields: [],
      },
      {
        id: 402,
        name: "Limonada mineral",
        price: 50,
        display_price: 50,
        discount: 0,
        is_available: true,
        section_id: 4,
        image_url: null,
        custom_fields: [],
      },
      {
        id: 403,
        name: "Cerveza",
        price: 55,
        display_price: 55,
        discount: 0,
        is_available: true,
        section_id: 4,
        image_url: null,
        custom_fields: [
          {
            id: "cf-cerveza-marca",
            name: "Marca",
            type: "dropdown",
            required: true,
            options: [
              { id: "opt-pacifico", name: "Pacífico", price: 0 },
              { id: "opt-modelo", name: "Modelo Especial", price: 0 },
              { id: "opt-victoria", name: "Victoria", price: 0 },
            ],
          },
        ],
      },
      {
        id: 404,
        name: "Michelada",
        price: 80,
        display_price: 80,
        discount: 0,
        is_available: true,
        section_id: 4,
        image_url: null,
        custom_fields: [],
      },
    ],
  },
];
