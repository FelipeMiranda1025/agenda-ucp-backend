/**
 * rateLimiter.ts
 * ─────────────────────────────────────────────────────────────
 * Middleware de rate limiting en memoria para rutas sensibles.
 * Mitiga ataques de fuerza bruta y spam de correos en endpoints
 * como /auth/forgot-password y /auth/login.
 *
 * Uso:
 *   import { forgotPasswordLimiter } from "../middleware/rateLimiter";
 *   router.post("/forgot-password", forgotPasswordLimiter, handler);
 *
 * NOTA: En producción con múltiples instancias del servidor,
 * reemplazar el Map en memoria por un store en Redis para que
 * el conteo sea compartido entre procesos.
 * ─────────────────────────────────────────────────────────────
 */

import { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;          // Número de intentos en la ventana actual
  windowStart: number;    // Timestamp (ms) de inicio de la ventana
  blockedUntil?: number;  // Timestamp (ms) hasta donde está bloqueado (si aplica)
}

// Almacenamiento en memoria: clave → estado de rate limit
const store = new Map<string, RateLimitEntry>();

/**
 * Limpia entradas expiradas del store periódicamente para
 * evitar memory leaks en servidores con mucho tráfico.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    const expired =
      (!entry.blockedUntil || now > entry.blockedUntil) &&
      now - entry.windowStart > 24 * 60 * 60 * 1000; // 24 horas
    if (expired) store.delete(key);
  }
}, 60 * 60 * 1000); // Ejecutar cada hora

/**
 * Fábrica de middlewares de rate limiting.
 *
 * @param maxRequests  Número máximo de peticiones permitidas en la ventana
 * @param windowMs     Duración de la ventana de tiempo en milisegundos
 * @param blockMs      Tiempo de bloqueo al superar el límite (ms)
 * @param keyExtractor Función que extrae la clave única por petición (por defecto: IP)
 */
function createRateLimiter(
  maxRequests: number,
  windowMs: number,
  blockMs: number,
  keyExtractor?: (req: Request) => string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Extraer clave: IP real considerando proxies (X-Forwarded-For) o IP directa
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    const key = keyExtractor ? keyExtractor(req) : ip;
    const now = Date.now();

    let entry = store.get(key);

    // Si está en periodo de bloqueo activo, rechazar
    if (entry?.blockedUntil && now < entry.blockedUntil) {
      const retryAfterSec = Math.ceil((entry.blockedUntil - now) / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        message: `Demasiadas solicitudes. Intente nuevamente en ${retryAfterSec} segundos.`,
      });
      return;
    }

    // Si no existe entrada o la ventana expiró, reiniciar
    if (!entry || now - entry.windowStart > windowMs) {
      entry = { count: 1, windowStart: now };
      store.set(key, entry);
      return next();
    }

    // Incrementar contador dentro de la ventana
    entry.count += 1;

    // Supera el límite: aplicar bloqueo temporal
    if (entry.count > maxRequests) {
      entry.blockedUntil = now + blockMs;
      const retryAfterSec = Math.ceil(blockMs / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        message: `Demasiadas solicitudes. Intente nuevamente en ${retryAfterSec} segundos.`,
      });
      return;
    }

    return next();
  };
}

const isDev = process.env.NODE_ENV !== "production";

/**
 * Rate limiter para /auth/login y /auth/forgot-password.
 * En desarrollo se desactivan para no bloquear pruebas (429).
 * En producción: login 10/5min (bloqueo 15min); forgot-password 5/15min (bloqueo 30min).
 */

/** En desarrollo no bloquea login (evita 429 tras pruebas repetidas). En producción: 10/5min, bloqueo 15min. */
export const loginLimiter = isDev
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : createRateLimiter(10, 5 * 60 * 1000, 15 * 60 * 1000);

/** En desarrollo no bloquea forgot-password. */
export const forgotPasswordLimiter = isDev
  ? (_req: Request, _res: Response, next: NextFunction) => next()
  : createRateLimiter(5, 15 * 60 * 1000, 30 * 60 * 1000);