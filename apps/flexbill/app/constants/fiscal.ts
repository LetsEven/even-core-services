// Constantes fiscales — espejo de even-backend/src/config/fiscal.js.
//
// BACKEND = FUENTE DE VERDAD. Estos valores solo sirven para PREVIEW visual;
// el backend recalcula todo al crear la transacción. Viven en @even/payments
// (commissions.ts); se re-exportan aquí para los imports existentes.
// El reparto cliente/restaurante vive en SERVICE_COMMISSION_RATES.
export { IVA_FACTOR, IVA_RATE } from "@even/payments";
