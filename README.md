# Agenda Docente UCP — Backend

API REST para el Sistema de Agenda Docente de la Universidad Católica de Pereira.

**Stack:** Node.js 20 · Express 4 · TypeScript 5 · PostgreSQL 15 · JWT · Multer · Nodemailer

> El frontend vive en un repositorio separado: `agenda-ucp-frontend`.

---

## Quick start (Docker — recomendado)

```bash
git clone <url-de-este-repo>
cd agenda-ucp-backend
cp .env.example .env       # editar con tus credenciales reales
docker compose up --build -d
curl http://localhost:4000/api/health
```

Esto levanta:
- **Postgres 15** en `localhost:5432` (usuario `admin`, bd `agendadocentedb`).
- **API Express** en `http://localhost:4000/api`.

La primera vez que arranca, el contenedor de Postgres ejecuta automáticamente
`migrations/001_initial_schema.sql` y carga datos semilla.

Para reinicializar desde cero:
```bash
docker compose down -v && docker compose up --build -d
```

---

## Quick start (sin Docker — desarrollo local)

Requisitos: Node.js 20+ y un Postgres 15 corriendo.

```bash
cp .env.example .env
npm install
npm run dev      # ts-node-dev con autoreload
# build de producción:
npm run build
npm start
```

---

## Variables de entorno

Ver `.env.example` para la lista completa. Las críticas:

| Variable        | Descripción                                          |
| --------------- | ---------------------------------------------------- |
| `PORT`          | Puerto del API (default 4000)                        |
| `DATABASE_URL`  | Cadena de conexión a Postgres                        |
| `JWT_SECRET`    | Secreto para firmar tokens — **cambiar en prod**     |
| `CORS_ORIGIN`   | Orígenes permitidos (separados por coma)             |
| `FRONTEND_URL`  | URL pública del frontend (links de recuperación)     |
| `UPLOADS_DIR`   | Carpeta de uploads de multer                         |
| `SMTP_*`        | Credenciales SMTP para correos transaccionales       |

---

## Endpoints principales

```
GET    /api/health
POST   /api/auth/login
POST   /api/auth/forgot-password
POST   /api/auth/verify-password         (auth)
POST   /api/auth/change-password         (auth)
GET    /api/auth/me                      (auth)

# Catálogos (read-only)
GET    /api/roles | /api/states | /api/semester | /api/faculties
GET    /api/education-levels | /api/professional-careers
GET    /api/indirect-teaching | /api/investigations | /api/social-projects
GET    /api/teacher-training | /api/degree-works
GET    /api/complementary-activities | /api/administrative-activities
GET    /api/academic-practices

# CRUD (auth)
GET|POST|PUT|DELETE  /api/subjects
GET|POST|PUT|DELETE  /api/agendas
GET|POST|PUT         /api/agenda-views
GET|POST|DELETE      /api/agenda-comments
GET|POST|DELETE      /api/user-hierarchy
GET|POST             /api/docente-config
GET|PUT              /api/system-settings/:key
GET|POST|PUT|DELETE  /api/recommendation-rules
POST                 /api/recommendation-rules/reset
GET                  /api/users | /api/users/by-cc/:cc
GET                  /api/audit-log

# Subida de archivos (auth)
POST   /api/upload/parse-document
```

Todas las rutas (excepto `/health`, `/auth/login`, `/auth/forgot-password`)
requieren el header `Authorization: Bearer <jwt>`.

---

## Estructura

```
backend/
├── src/
│   ├── index.ts              # Entry point Express
│   ├── db.ts                 # Pool de pg
│   ├── middleware/           # auth, logger, error-handler
│   ├── routes/               # endpoints por dominio
│   ├── services/             # email
│   └── types/
├── migrations/
│   └── 001_initial_schema.sql
├── Dockerfile
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

---

## Despliegue

1. Copiar el repo al servidor.
2. Configurar `.env` con credenciales reales (Postgres, JWT, SMTP).
3. `docker compose up --build -d`.
4. Verificar `curl http://localhost:4000/api/health`.
5. Configurar el frontend con `VITE_API_URL=http://<IP-SERVIDOR>:4000/api`.

Para reverse proxy (nginx/Apache) delante del backend, ver
`FRONTEND_URL` y `CORS_ORIGIN`.

---

## Licencia

Uso interno UCP.
