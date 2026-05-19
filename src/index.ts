import "dotenv/config";
import express, { Express } from "express";
import cors from "cors";
import helmet from "helmet";

// Importar todas las rutas del proyecto
import { healthRouter } from "./routes/health";
import authRouter from "./routes/auth";
import catalogsRouter from "./routes/catalogs";
import subjectsRouter from "./routes/subjects";
import usersRouter from "./routes/users";
import agendasRouter from "./routes/agendas";
import agendaViewsRouter from "./routes/agendaViews";
import agendaCommentsRouter from "./routes/agendaComments";
import userHierarchyRouter from "./routes/userHierarchy";
import auditLogRouter from "./routes/auditLog";
import docenteConfigRouter from "./routes/docenteConfig";
import uploadRouter from "./routes/upload";
import recommendationRulesRouter from "./routes/recommendationRules";
import systemSettingsRouter from "./routes/systemSettings";
import lineamientosDocumentsRouter from "./routes/lineamientosDocuments";
import semesterArchivesRouter from "./routes/semesterArchives";

import { requestLogger } from "./middleware/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { closeDb, pingDb } from "./db";

const app: Express = express();
const PORT = parseInt(process.env.PORT ?? "4000", 10);

// ============================================
// CORS (Siempre al principio para manejar OPTIONS)
// ============================================
app.use(
  cors({
    origin: true, // Permite peticiones desde el frontend en localhost:8080, 5173, etc.
    credentials: true,
  })
);

// ============================================
// Seguridad
// ============================================
app.use(helmet());
app.disable("x-powered-by");

// Sin rate limit global en /api: 100 req/15min bloqueaba el uso normal (React Query,
// system-settings al cargar, login, etc.). Login y forgot-password tienen límites
// propios en middleware/rateLimiter.ts.

// Parseo
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(requestLogger);

const uploadsDir = process.env.UPLOADS_DIR ?? process.env.UPLOAD_DIR ?? "/var/app/uploads";
app.use("/uploads", express.static(uploadsDir));

// ============================================
// Rutas API
// ============================================
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/subjects", subjectsRouter);
app.use("/api/users", usersRouter);
app.use("/api/agendas", agendasRouter);
app.use("/api/agenda-views", agendaViewsRouter);
app.use("/api/agenda-comments", agendaCommentsRouter);
app.use("/api/user-hierarchy", userHierarchyRouter);
app.use("/api/lineamientos-documents", lineamientosDocumentsRouter);
app.use("/api/audit-log", auditLogRouter);
app.use("/api/docente-config", docenteConfigRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/recommendation-rules", recommendationRulesRouter);
app.use("/api/system-settings", systemSettingsRouter);
app.use("/api/semester-archives", semesterArchivesRouter);
app.use("/api", catalogsRouter);

app.get("/api", (_req, res) => {
  res.json({
    name: "Agenda UCP API",
    version: "1.0.0",
    status: "ok",
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

// ============================================
// Inicialización
// ============================================
let server: ReturnType<typeof app.listen>;

const startServer = async () => {
  try {
    const dbOk = await pingDb();
    if (!dbOk) {
      console.error("❌ No se pudo conectar a la base de datos. El servidor no se iniciará.");
      process.exit(1);
    }
    console.log("✅ Conexión a PostgreSQL verificada");

    server = app.listen(PORT, () => {
      console.log(`✅ Backend UCP escuchando en http://0.0.0.0:${PORT}/api`);
      const dbUrl = process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ":****@");
      console.log(`   DB: ${dbUrl}`);
    });
  } catch (error) {
    console.error("❌ Error fatal al iniciar el servidor:", error);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  console.log(`[server] Señal ${signal} recibida, cerrando conexiones…`);
  if (server) {
    server.close(async (err) => {
      if (err) {
        console.error("❌ Error al cerrar el servidor:", err);
        process.exit(1);
      }
      await closeDb();
      console.log("✅ Servidor cerrado correctamente");
      process.exit(0);
    });
  } else {
    await closeDb();
    process.exit(0);
  }
  setTimeout(() => {
    console.error("⚠️ No se pudo cerrar gracefulmente, forzando salida");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  console.error("❌ Excepción no capturada:", error);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ Promesa rechazada no manejada:", reason);
  shutdown("unhandledRejection");
});

startServer();

export default app;