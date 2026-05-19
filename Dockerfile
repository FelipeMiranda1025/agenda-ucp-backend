# ---- Etapa 1: Build ----
FROM node:20-alpine AS builder
WORKDIR /app

# Instalación de herramientas de compilación
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# Usamos 'npm ci' para asegurar que se instalen exactamente las versiones del lockfile
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Etapa 2: Runtime (Producción) ----
FROM node:20-alpine
# Definir variables de entorno
ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

# Instalación de utilidades necesarias
RUN apk add --no-cache wget

# Copiar solo lo necesario de la etapa anterior
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
RUN mkdir -p /var/app/uploads

# --- SEGURIDAD: Usuario no root ---
RUN chown -R node:node /app /var/app/uploads

# A partir de aquí, nada se ejecuta como root
USER node

EXPOSE 4000

# Verificación de salud (Healthcheck) básica
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]