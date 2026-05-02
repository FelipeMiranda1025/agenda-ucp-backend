FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ---- runtime ----
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN apk add --no-cache wget

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist

COPY init-db.js ./
COPY migrations ./migrations

RUN mkdir -p /var/app/uploads

EXPOSE 4000

#CMD ["node", "dist/index.js"]

CMD node init-db.js && node dist/index.js