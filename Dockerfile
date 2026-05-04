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
# Definir variables de entorno antes de cualquier operación
ENV NODE_ENV=production
ENV PORT=4000

WORKDIR /app

# Instalación de utilidades necesarias y limpieza de caché de apk
RUN apk add --no-cache wget

# Copiar solo lo necesario de la etapa anterior
COPY --from=builder /app/package*.json ./
# Instalación limpia de dependencias de producción
RUN npm ci --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist

# Solución al error previo: aseguramos existencia de archivos/carpetas
RUN touch init-db.js && mkdir -p migrations /var/app/uploads

# --- SEGURIDAD: Usuario no root ---
# Cambiamos la propiedad de la carpeta de la app al usuario 'node' (ya existe en la imagen alpine)
RUN chown -R node:node /app /var/app/uploads

# A partir de aquí, nada se ejecuta como root
USER node

EXPOSE 4000

# Verificación de salud (Healthcheck) básica
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]