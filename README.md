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
- Procesamiento mediante parser con mecanismo de fallback

### Servicios

- Nodemailer para correos transaccionales

### Infraestructura

- Docker
- Docker Compose
- Render

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
