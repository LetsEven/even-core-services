# even-crew (Vite SPA): build en monorepo con turbo prune y servido con Caddy.
# Contexto de build: raiz del monorepo (railway.json -> dockerfilePath apps/crew/Dockerfile).

# ---- Etapa 1: build ----
FROM node:22-alpine AS builder
WORKDIR /app

# Poda del monorepo solo a @even/crew y sus dependencias internas
COPY . .
RUN npx turbo@2.11.8 prune @even/crew --docker

WORKDIR /app/out-install
RUN cp -r /app/out/json/. . && cp /app/out/package-lock.json .
RUN npm ci

RUN cp -r /app/out/full/. .

# Las variables VITE_* se incrustan en el bundle en tiempo de build
ARG VITE_API_BASE_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ARG VITE_CREW_SOCKET_SECRET
ARG VITE_APP_LABEL
# Autenticacion: clerk (default) | local (servicio crew-auth) | demo
ARG VITE_AUTH_PROVIDER
ARG VITE_CREW_AUTH_URL
# Modo demo (solo dev): UI con datos ficticios, sin backend ni Clerk. Nunca en produccion.
ARG VITE_DEMO_MODE
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    VITE_CREW_SOCKET_SECRET=$VITE_CREW_SOCKET_SECRET \
    VITE_APP_LABEL=$VITE_APP_LABEL \
    VITE_AUTH_PROVIDER=$VITE_AUTH_PROVIDER \
    VITE_CREW_AUTH_URL=$VITE_CREW_AUTH_URL \
    VITE_DEMO_MODE=$VITE_DEMO_MODE

RUN npx turbo@2.11.8 run build --filter=@even/crew

# ---- Etapa 2: runtime ----
FROM caddy:2-alpine
RUN printf ':{$PORT} {\n\troot * /srv\n\tencode gzip\n\ttry_files {path} /index.html\n\tfile_server\n}\n' > /etc/caddy/Caddyfile
COPY --from=builder /app/out-install/apps/crew/dist /srv
EXPOSE 8080
ENV PORT=8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
