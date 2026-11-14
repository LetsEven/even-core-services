// Se carga bajo demanda (import dinámico) para que `motion` no pese en el bundle inicial.
// `domMax` incluye los layout animations que necesita `layoutId`.
export { domMax as default } from "motion/react";
