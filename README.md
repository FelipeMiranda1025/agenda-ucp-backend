# Agenda Docente UCP — Backend

API REST del Sistema de Agenda Docente de la Universidad Católica de Pereira.

El backend centraliza la lógica de negocio, autenticación, gestión de agendas, persistencia de datos y comunicación con servicios externos utilizados por la aplicación.

> El frontend se encuentra en un repositorio independiente: **`agenda-ucp-frontend`**.

## Stack tecnológico

### Backend

- Node.js 20
- Express 4
- TypeScript 5

### Base de datos

- PostgreSQL 15
- Migraciones SQL

### Autenticación y seguridad

- JWT
- Middleware de autenticación
- Control de acceso según roles
- CORS

### Gestión de archivos y documentos

- Multer
- Procesamiento de documentos PDF

### Inteligencia artificial

- Google Gemini API
- Interpretación de documentos PDF de lineamientos
- Extracción de reglas y configuraciones
- Parser con mecanismo de fallback

### Servicios

- Nodemailer para correos transaccionales

### Infraestructura

- Docker
- Docker Compose
- Render

### Control de versiones

- Git
- GitHub

## Funcionalidades principales

- Autenticación y gestión de sesiones mediante JWT.
- Recuperación y cambio de contraseña.
- Gestión de usuarios y roles.
- Gestión de asignaturas.
- Creación, edición y consulta de agendas docentes.
- Gestión del flujo de revisión y aprobación de agendas.
- Gestión de comentarios y observaciones.
- Gestión de jerarquías de usuarios.
- Registro de auditoría.
- Gestión de configuraciones docentes.
- Gestión de reglas de recomendación.
- Gestión de configuraciones del sistema.
- Carga y procesamiento de documentos PDF.
- Interpretación de lineamientos mediante Google Gemini.
- Extracción y clasificación de reglas a partir de documentos.
- Historial y trazabilidad de documentos de lineamientos.

## Integración con inteligencia artificial

El sistema incorpora un módulo para la gestión e interpretación de documentos PDF que contienen lineamientos institucionales.

El flujo general es:

```text
PDF de lineamientos
        │
        ▼
   Backend Express
        │
        ▼
Extracción de texto
        │
        ▼
   Google Gemini
        │
        ▼
Interpretación de lineamientos
        │
        ▼
Extracción de reglas
        │
        ▼
Normalización y validación
        │
        ▼
Persistencia en PostgreSQL
```

Las reglas extraídas pueden ser revisadas y posteriormente utilizadas por el sistema para gestionar configuraciones y recomendaciones relacionadas con las agendas docentes.

El procesamiento incorpora mecanismos de fallback para manejar casos en los que la interpretación mediante IA no produce el resultado esperado.

## API REST

### Salud del servicio

```text
GET /api/health
```

### Autenticación

```text
POST /api/auth/login
POST /api/auth/forgot-password
POST /api/auth/verify-password
POST /api/auth/change-password
GET  /api/auth/me
```

### Catálogos

```text
GET /api/roles
GET /api/states
GET /api/semester
GET /api/faculties
GET /api/education-levels
GET /api/professional-careers
GET /api/indirect-teaching
GET /api/investigations
GET /api/social-projects
GET /api/teacher-training
GET /api/degree-works
GET /api/complementary-activities
GET /api/administrative-activities
GET /api/academic-practices
```

### Agendas y gestión académica

```text
GET|POST|PUT|DELETE /api/subjects
GET|POST|PUT|DELETE /api/agendas
GET|POST|PUT        /api/agenda-views
GET|POST|DELETE     /api/agenda-comments
GET|POST|DELETE     /api/user-hierarchy
GET|POST            /api/docente-config
```

### Configuración y reglas

```text
GET|PUT             /api/system-settings/:key
GET|POST|PUT|DELETE /api/recommendation-rules
POST                /api/recommendation-rules/reset
```

### Usuarios y auditoría

```text
GET /api/users
GET /api/users/by-cc/:cc
GET /api/audit-log
```

### Procesamiento de documentos

```text
POST /api/upload/parse-document
```

### Procesamiento de lineamientos con IA

```text
POST /api/lineamientos-documents/upload
```

Este endpoint permite cargar documentos PDF de lineamientos institucionales, procesar su contenido y utilizar Google Gemini para interpretar y extraer reglas estructuradas.

Las rutas protegidas requieren autenticación mediante:

```text
Authorization: Bearer <jwt>
```

Las excepciones principales son las rutas públicas de salud, inicio de sesión y recuperación de contraseña.

## Base de datos

El sistema utiliza PostgreSQL como motor de persistencia.

Las migraciones se encuentran en:

```text
migrations/
```

La estructura inicial de la base de datos se crea mediante las migraciones SQL incluidas en el proyecto.

Cuando se utiliza Docker Compose, PostgreSQL se inicia junto con el entorno del backend y se ejecutan las migraciones correspondientes.

## Arquitectura

El sistema está compuesto por dos aplicaciones independientes:

```text
┌──────────────────────────────┐
│          Frontend            │
│ React + TypeScript + Vite    │
└──────────────┬───────────────┘
               │
             HTTP
             REST API
               │
               ▼
┌──────────────────────────────┐
│           Backend            │
│ Node.js + Express + TS       │
└──────────────┬───────────────┘
               │
        ┌──────┴───────┐
        ▼              ▼
┌──────────────┐  ┌──────────────┐
│  PostgreSQL  │  │ Google Gemini│
└──────────────┘  └──────────────┘
```

## Estructura del proyecto

```text
src/
├── index.ts                 # Punto de entrada de Express
├── db.ts                    # Conexión y pool de PostgreSQL
├── middleware/              # Autenticación, logging y manejo de errores
├── routes/                  # Endpoints organizados por dominio
├── services/                # Servicios de aplicación
│   ├── email
│   └── iaLineamientosParser
└── types/                   # Tipos e interfaces

migrations/
└── 001_initial_schema.sql

Dockerfile
docker-compose.yml
package.json
tsconfig.json
```

## Requisitos

- Node.js 20+
- PostgreSQL 15+
- npm 10+

Para ejecutar el proyecto mediante contenedores:

- Docker
- Docker Compose

## Puesta en marcha

### Desarrollo local

Clonar el repositorio:

```bash
git clone <url-del-repositorio>
cd agenda-ucp-backend
```

Instalar dependencias:

```bash
npm install
```

Crear el archivo de variables de entorno:

```bash
cp .env.example .env
```

Configurar las variables necesarias y ejecutar:

```bash
npm run dev
```

El backend estará disponible por defecto en:

```text
http://localhost:4000
```

### Docker

Docker Compose permite ejecutar el backend junto con PostgreSQL.

```bash
docker compose up --build -d
```

Verificar que la API esté funcionando:

```bash
curl http://localhost:4000/api/health
```

Para reinicializar el entorno:

```bash
docker compose down -v
docker compose up --build -d
```

## Variables de entorno

Las variables necesarias se encuentran documentadas en:

```text
.env.example
```

Entre las principales se encuentran:

| Variable | Descripción |
|---|---|
| `PORT` | Puerto utilizado por la API |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `JWT_SECRET` | Secreto utilizado para firmar tokens JWT |
| `CORS_ORIGIN` | Orígenes permitidos |
| `FRONTEND_URL` | URL del frontend |
| `UPLOADS_DIR` | Directorio utilizado para archivos cargados |
| `GEMINI_API_KEY` | Clave de acceso a Google Gemini |
| `SMTP_*` | Configuración del servicio de correo |

> **Importante:** las claves, contraseñas y demás credenciales deben configurarse mediante variables de entorno y no deben almacenarse en el repositorio.

## Despliegue

El backend está preparado para ejecutarse mediante Docker y desplegarse en infraestructura cloud.

El proyecto utiliza **Render** para el despliegue del servicio.

Para producción deben configurarse las variables de entorno correspondientes, incluyendo la conexión a la base de datos, autenticación, CORS, URL del frontend y servicios externos.

## Relación con el frontend

El frontend se encuentra en un repositorio independiente:

**`agenda-ucp-frontend`**

El frontend consume esta API mediante la variable:

```text
VITE_API_URL
```

En desarrollo:

```text
VITE_API_URL=http://localhost:4000/api
```

## Proyecto académico

**Sistema de Agenda Docente — Universidad Católica de Pereira**

Proyecto de grado desarrollado como parte del programa de **Tecnología en Desarrollo de Software**.

El proyecto fue desarrollado mediante trabajo colaborativo utilizando Git y GitHub.

## Autores

- Luis Felipe Correa Martínez
- Felipe Miranda
- Juan Diego Pachón
