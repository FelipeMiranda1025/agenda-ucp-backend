import { Router } from "express";
import { pingDb } from "../db";

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get("/health", async (_req, res) => {
  const dbOk = await pingDb();
  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "ok" : "degraded",
    db: dbOk ? "ok" : "error",
    version: "1.0.0",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});
