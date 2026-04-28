# =============================================
# Backend API — Agenda UCP
# Node.js + Express + pg + multer + pdf-parse + nodemailer
# =============================================

FROM node:20-alpine AS builder
WORKDIR /app

# Dependencias nativas requeridas por pdf-parse
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---- Runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN apk add --no-cache wget

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist

# Carpeta de uploads (se monta como volumen en compose)
RUN mkdir -p /var/app/uploads

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:4000/api/health > /dev/null || exit 1

CMD ["node", "dist/index.js"]
