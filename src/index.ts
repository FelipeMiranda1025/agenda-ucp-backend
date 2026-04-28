import "dotenv/config";
import express from "express";
import cors from "cors";

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

import { requestLogger } from "./middleware/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { closeDb, pingDb } from "./db";

const app = express();
const PORT = parseInt(process.env.PORT ?? "4000", 10);

const corsOrigins = (process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? "http://localhost:5173,http://localhost:8080")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (corsOrigins.includes("*") || corsOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`CORS bloqueado para origen: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Servir archivos subidos
app.use(
  "/uploads",
  express.static(process.env.UPLOADS_DIR ?? process.env.UPLOAD_DIR ?? "/var/app/uploads")
);

// Rutas API
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api", catalogsRouter); // /api/roles, /api/states, etc.
app.use("/api/subjects", subjectsRouter);
app.use("/api/users", usersRouter);
app.use("/api/agendas", agendasRouter);
app.use("/api/agenda-views", agendaViewsRouter);
app.use("/api/agenda-comments", agendaCommentsRouter);
app.use("/api/user-hierarchy", userHierarchyRouter);
app.use("/api/audit-log", auditLogRouter);
app.use("/api/docente-config", docenteConfigRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/recommendation-rules", recommendationRulesRouter);
app.use("/api/system-settings", systemSettingsRouter);

app.get("/api", (_req, res) => {
  res.json({
    name: "Agenda UCP API",
    version: "1.0.0",
    status: "ok",
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`✅ Backend UCP escuchando en http://localhost:${PORT}/api`);
  const dbUrl = process.env.DATABASE_URL?.replace(/:([^:@]+)@/, ":****@");
  console.log(`   DB: ${dbUrl}`);
  pingDb().then((ok) => {
    console.log(`   Conexión a Postgres: ${ok ? "OK" : "FALLÓ"}`);
  });
});

async function shutdown(signal: string) {
  console.log(`[server] Señal ${signal} recibida, cerrando…`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
