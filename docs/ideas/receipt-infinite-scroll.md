# Idea: ticket de pago con scroll infinito y promo escondida

**Estado:** solo concepto, sin implementar.

Después de que el ticket se imprime y se sella como PAGADO (`payment-success` de FlexBill), el usuario puede seguir haciendo scroll hacia abajo: el ticket "no termina" y se llena de contenido aleatorio (líneas de ticket, frases, datos curiosos).

Referencia: https://dev.to/bearsyntax/infinite-scroll-cvs-receipt--275g

## Promo escondida (para generar interacción)
- En algún punto del scroll aparece un código de promoción.
- Si el usuario lo ingresa, obtiene un descuento.
- La posición del código puede variar por usuario o por visita.

## A definir
- Qué contenido aleatorio mostrar y de dónde sale.
- Qué descuento se ofrece, dónde se canjea y cómo se valida en backend.
- Si aplica también a Tap & Pay.
