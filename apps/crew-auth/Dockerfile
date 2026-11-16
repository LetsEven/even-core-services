# crew-auth (Hono + SQLite): build en monorepo con turbo prune; runtime minimo sin herramientas de compilacion.
# Contexto de build: raiz del monorepo (railway.json -> dockerfilePath apps/crew-auth/Dockerfile).

# ---- Etapa 1: build ----
FROM node:22-alpine AS builder
# Solo para compilar better-sqlite3 si no hay binario precompilado para la plataforma (p. ej. arm64/musl)
RUN apk add --no-cache python3 make g++
WORKDIR /app

# Poda del monorepo solo a @even/crew-auth y sus dependencias internas
COPY . .
RUN npx turbo@2.11.8 prune @even/crew-auth --docker

WORKDIR /app/out-install
RUN cp -r /app/out/json/. . && cp /app/out/package-lock.json .
RUN npm ci

RUN cp -r /app/out/full/. .
RUN npx turbo@2.11.8 run build --filter=@even/crew-auth

# Dejar solo dependencias de produccion (conserva el better-sqlite3 ya compilado)
RUN npm prune --omit=dev

# ---- Etapa 2: runtime ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=builder /app/out-install/node_modules ./node_modules
COPY --from=builder /app/out-install/package.json ./package.json
COPY --from=builder /app/out-install/apps/crew-auth/package.json ./apps/crew-auth/package.json
COPY --from=builder /app/out-install/apps/crew-auth/dist ./apps/crew-auth/dist

RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8080
WORKDIR /app/apps/crew-auth
# Alta del primer super: docker exec -it <contenedor> node dist/cli/createSuper.js --branch <id> --name <n> --pairing-code
CMD ["node", "dist/server.js"]
