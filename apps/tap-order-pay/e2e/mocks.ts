import { mockPaymentsApi, type MockResponse, type PaymentsApiOptions } from "@even/e2e";
import type { Page } from "@playwright/test";

import { API_URL } from "./api";

export const RESTAURANT_ID = 4;
export const BRANCH_NUMBER = 1;
export const TABLE = "12";
export const MENU_URL = `/${RESTAURANT_ID}/${BRANCH_NUMBER}/menu?table=${TABLE}`;
export const CARD_SELECTION_URL = `/${RESTAURANT_ID}/${BRANCH_NUMBER}/card-selection?table=${TABLE}`;

const now = "2026-10-01T12:00:00.000Z";

export const restaurant = {
  id: RESTAURANT_ID,
  user_id: 1,
  name: "Restaurante E2E",
  description: "Tap Order & Pay de prueba",
  logo_url: null,
  banner_url: null,
  address: null,
  phone: null,
  email: null,
  is_active: true,
  created_at: now,
  updated_at: now,
};

export const clubSandwich = {
  id: 101,
  section_id: 10,
  name: "Club sándwich",
  description: "Pollo, tocino y aguacate",
  image_url: null,
  price: 180,
  discount: 0,
  custom_fields: [],
  is_available: true,
  display_order: 1,
  created_at: now,
  updated_at: now,
};

const menu = [
  {
    id: 10,
    name: "Desayunos",
    is_active: true,
    display_order: 1,
    restaurant_id: RESTAURANT_ID,
    created_at: now,
    updated_at: now,
    items: [clubSandwich],
  },
];

export interface CartItemMock {
  id: string;
  menu_item_id: number;
  name: string;
  price: number;
  quantity: number;
}

export interface TapOrderApiOptions {
  cartItems?: CartItemMock[];
  /** Respuesta al crear la orden de Apple/Google Pay. Por defecto, un 503 pasajero. */
  walletOrder?: MockResponse;
  payments?: Omit<PaymentsApiOptions, "apiUrl">;
}

/**
 * Mock de los endpoints de even-backend que usa Tap Order & Pay: los de pagos con
 * `mockPaymentsApi` y el resto (habitación, menú, carrito, POS, promociones)
 * aquí. Lo que no tenga mock lo aborta el guard de red de `@even/e2e`.
 */
export async function mockTapOrderFlowApi(
  page: Page,
  { cartItems = [], walletOrder, payments }: TapOrderApiOptions = {},
) {
  const totalItems = cartItems.reduce((n, i) => n + i.quantity, 0);
  const totalAmount = cartItems.reduce((n, i) => n + i.price * i.quantity, 0);
  const cartId = cartItems.length ? "cart_e2e_1" : null;
  const cart = {
    cart_id: cartId,
    items: cartItems.map((i) => ({
      description: "",
      images: [],
      features: [],
      discount: 0,
      extraPrice: 0,
      customFields: [],
      ...i,
    })),
    total_items: totalItems,
    total_amount: totalAmount,
  };
  const wallet = walletOrder ?? { status: 503, body: { success: false, error: "Servicio no disponible" } };

  const responses: Array<[string, RegExp, MockResponse]> = [
    ["GET", /^\/restaurants\/\d+\/\d+\/[^/]+\/validate$/, { success: true, data: { valid: true } }],
    ["GET", /^\/restaurants\/\d+\/\d+\/complete$/, { success: true, data: { restaurant, menu } }],
    ["GET", /^\/restaurants\/\d+\/\d+\/order-flow-status$/, { success: true, data: { is_high_demand: false } }],
    ["GET", /^\/cart$/, { success: true, data: cart }],
    [
      "GET",
      /^\/cart\/totals$/,
      { success: true, data: { cart_id: cartId, total_items: totalItems, total_amount: totalAmount } },
    ],
    [
      "GET",
      /^\/tap-orders\/restaurant\/\d+\/active\/user\/[^/]+$/,
      { success: true, hasActiveOrder: false, data: null },
    ],
    // Proveedor de pago, MSI, agente POS y alta demanda del checkout en una sola llamada.
    [
      "GET",
      /^\/tap-orders\/checkout-context\/\d+\/\d+$/,
      {
        success: true,
        data: {
          provider: "ecartpay",
          msi: null,
          agentStatus: { hasIntegration: false, isActive: false, requiresAgent: false },
          orderFlowStatus: { is_high_demand: false },
        },
      },
    ],
    ["GET", /^\/promotions\/active$/, { success: true, data: [] }],
    ["GET", /^\/promotions\/claimed-order-discount$/, { success: true, data: null }],
    // Sin POS integrado: el pedido no depende de un agente conectado.
    [
      "GET",
      /^\/pos\/restaurant\/\d+\/branch\/\d+\/agent-status$/,
      { hasIntegration: false, isActive: false, requiresAgent: false },
    ],
    ["POST", /^\/payments\/(apple|google)-pay\/order$/, wallet],
  ];

  // El layout carga el SDK de EcartPay; un stub vacío basta para el humo.
  await page.route("https://pay.ecart.com/sdk/pay.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );

  await page.route(`${API_URL}/**`, (route, request) => {
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    const match = responses.find(([method, re]) => method === request.method() && re.test(path));
    // Lo demás sigue a los mocks de pagos y al guard de red.
    if (!match) return route.fallback();
    const response = match[2];
    return typeof response.status === "number" && typeof response.body === "object"
      ? route.fulfill({ status: response.status, json: response.body })
      : route.fulfill({ json: response });
  });

  // Se registra después para que tenga prioridad sobre las rutas de arriba.
  return mockPaymentsApi(page, { ...payments, apiUrl: API_URL });
}

/** Dos club sándwich en el carrito: $360 de subtotal. */
export const cartWithClubSandwich: CartItemMock[] = [
  { id: "ci_e2e_1", menu_item_id: clubSandwich.id, name: clubSandwich.name, price: clubSandwich.price, quantity: 2 },
];
