/**
 * auth.ts — Rutas de autenticación
 * ─────────────────────────────────────────────────────────────
 * Endpoints:
 *   POST /api/auth/login
 *   GET  /api/auth/me
 *   POST /api/auth/forgot-password   ← Recuperación de contraseña
 *   POST /api/auth/verify-password
 *   POST /api/auth/change-password
 * ─────────────────────────────────────────────────────────────
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { sendTemporaryPasswordEmail } from "../services/email";
import { forgotPasswordLimiter, loginLimiter } from "../middleware/rateLimiter";

const router = Router();

// ─── Utilidades criptográficas ──────────────────────────────────────────────

/**
 * Hash SHA-256 de un texto.
 * NOTA: Para nuevos proyectos se recomienda bcrypt/argon2.
 * SHA-256 se mantiene aquí por compatibilidad con la BD existente.
 */
function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/**
 * Genera una contraseña temporal criptográficamente segura de 12 caracteres.
 * Garantiza al menos: 1 mayúscula, 1 minúscula, 1 dígito, 1 especial.
 * Usa crypto.randomInt para evitar sesgos estadísticos.
 */
function generateTempPassword(): string {
  const upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // sin I y O (confundibles)
  const lower   = "abcdefghijkmnopqrstuvwxyz";   // sin l (confundible)
  const digits  = "23456789";                     // sin 0 y 1 (confundibles)
  const special = "!@#$%&*?";
  const all     = upper + lower + digits + special;

  const pick = (set: string): string => set[crypto.randomInt(0, set.length)];

  // Al menos uno de cada categoría (garantía de cumplimiento de política)
  const required = [pick(upper), pick(lower), pick(digits), pick(special)];

  // Completar hasta 12 caracteres con caracteres aleatorios del conjunto total
  const remaining: string[] = [];
  for (let i = 0; i < 8; i++) remaining.push(pick(all));

  const arr = [...required, ...remaining];

  // Fisher-Yates shuffle con crypto.randomInt (criptográficamente seguro)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  return arr.join("");
}

/**
 * Valida que un identificador sea cédula (solo dígitos) o correo @ucp.edu.co.
 * Retorna true si es válido.
 */
function isValidIdentifier(value: string): boolean {
  if (!value || value.length < 4 || value.length > 100) return false;

  const isNumeric = /^\d+$/.test(value);
  if (isNumeric) return value.length >= 6; // cédula: mínimo 6 dígitos

  // Correo institucional: formato básico + dominio UCP
  const emailRegex = /^[a-zA-Z0-9._%+\-]+@ucp\.edu\.co$/i;
  return emailRegex.test(value);
}

// ─── POST /api/auth/login ───────────────────────────────────────────────────

/**
 * Inicio de sesión con cédula o correo + contraseña.
 * Aplica rate limiting por IP para mitigar fuerza bruta.
 *
 * Sentencia preparada: usa parámetros posicionales ($1, $2) — nunca interpolación.
 */
router.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};

  // Validación básica de presencia
  if (
    !username || typeof username !== "string" ||
    !password || typeof password !== "string"
  ) {
    return res.status(400).json({ message: "Usuario y contraseña requeridos" });
  }

  const trimmedUser = username.trim().slice(0, 100);
  const trimmedPwd  = password.slice(0, 128);

  if (!trimmedUser || !trimmedPwd) {
    return res.status(400).json({ message: "Datos inválidos" });
  }

  try {
    const hashed = sha256(trimmedPwd);

    /*
     * SENTENCIA PREPARADA — búsqueda por cédula o correo con contraseña hasheada.
     * Parámetro $1 = username (cédula o email en minúsculas), $2 = password hash.
     * La función LOWER() garantiza case-insensitive en el email.
     * Sólo retorna usuarios activos (id_state = 1).
     */
    const user = await queryOne<{
      id: number;
      cc: string;
      email: string;
      first_name: string;
      second_name: string;
      first_last_name: string;
      second_last_name: string;
      id_rol: number;
      id_state: number;
    }>(
      `SELECT id, cc, email, first_name, second_name,
              first_last_name, second_last_name, id_rol, id_state
         FROM public.users
        WHERE (cc = $1 OR LOWER(email) = LOWER($1))
          AND password = $2
          AND id_state = 1`,
      [trimmedUser, hashed]
    );

    if (!user) {
      // Mensaje genérico: no revelar si el usuario existe o no
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error("[login] JWT_SECRET no configurado");
      return res.status(500).json({ message: "Error de configuración del servidor" });
    }

    const token = jwt.sign(
      { id: user.id, cc: user.cc, rolId: user.id_rol },
      secret,
      { expiresIn: "8h" }
    );

    return res.json({
      token,
      user: {
        id:             user.id,
        cc:             user.cc,
        email:          user.email,
        firstName:      user.first_name,
        secondName:     user.second_name,
        firstLastName:  user.first_last_name,
        secondLastName: user.second_last_name,
        rolId:          user.id_rol,
        statusId:       user.id_state,
      },
    });
  } catch (err) {
    console.error("[login] Error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// ─── GET /api/auth/me ───────────────────────────────────────────────────────

router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    /*
     * SENTENCIA PREPARADA — obtener perfil del usuario autenticado por ID.
     * El ID viene del JWT verificado en el middleware requireAuth.
     */
    const user = await queryOne<{
      id: number;
      cc: string;
      email: string;
      first_name: string;
      second_name: string;
      first_last_name: string;
      second_last_name: string;
      id_rol: number;
      id_state: number;
    }>(
      `SELECT id, cc, email, first_name, second_name,
              first_last_name, second_last_name, id_rol, id_state
         FROM public.users
        WHERE id = $1`,
      [req.user!.id]
    );

    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });

    return res.json({
      id:             user.id,
      cc:             user.cc,
      email:          user.email,
      firstName:      user.first_name,
      secondName:     user.second_name,
      firstLastName:  user.first_last_name,
      secondLastName: user.second_last_name,
      rolId:          user.id_rol,
      statusId:       user.id_state,
    });
  } catch {
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── POST /api/auth/forgot-password ────────────────────────────────────────

/**
 * Recuperación de contraseña.
 *
 * Flujo seguro:
 *  1. Validar y sanitizar el identificador recibido.
 *  2. Buscar el usuario por cédula o correo (solo activos).
 *  3. Generar contraseña temporal criptográficamente segura.
 *  4. Actualizar el hash en BD con sentencia preparada.
 *  5. Registrar fecha/hora del reset para auditoría.
 *  6. Enviar la contraseña en texto plano al correo del usuario.
 *  7. Respuesta siempre igual, independiente de si el usuario existe
 *     (evita enumeración de cuentas).
 *
 * Seguridad:
 *  - Rate limiting: máx. 5 peticiones/IP en 15 min (forgotPasswordLimiter).
 *  - Respuesta neutra: no revela si el usuario existe.
 *  - Sentencias preparadas: sin interpolación de strings en SQL.
 *  - Sanitización: solo acepta cédula (dígitos) o correo @ucp.edu.co.
 *  - La contraseña viaja cifrada por TLS (HTTPS). Asegúrate de que
 *    el servidor esté detrás de HTTPS en producción.
 */
router.post(
  "/forgot-password",
  forgotPasswordLimiter,                           // ← rate limiting por IP
  async (req: Request, res: Response) => {

    // ── 1. Validar y sanitizar el identificador ───────────────────────────
    const rawIdentifier = String(
      req.body?.identifier ?? req.body?.email ?? ""
    ).trim();

    if (!isValidIdentifier(rawIdentifier)) {
      /*
       * Aún con identificador inválido devolvemos 200 y el mismo mensaje
       * genérico para no revelar información. Internamente registramos el
       * intento para debugging.
       */
      console.warn("[forgot-password] Identificador inválido recibido:", {
        ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        length: rawIdentifier.length,
      });
      return res.json({
        message: "Si el identificador existe, recibirás las instrucciones al correo registrado.",
      });
    }

    // Normalizar: email siempre en minúsculas
    const identifier = /^\d+$/.test(rawIdentifier)
      ? rawIdentifier                        // cédula: sin cambios
      : rawIdentifier.toLowerCase();         // correo: lowercase

    const isNumeric = /^\d+$/.test(identifier);

    try {
      // ── 2. Buscar usuario en BD con sentencia preparada ─────────────────
      /*
       * SENTENCIA PREPARADA — búsqueda exclusiva por cédula o por correo,
       * según el tipo de identificador. Nunca concatenar el valor al SQL.
       *
       * Solo se recuperan usuarios activos (id_state = 1) para evitar
       * que cuentas deshabilitadas puedan resetearse.
       *
       * Se selecciona únicamente lo necesario: id, email, first_name.
       * No se expone contraseña ni otros campos sensibles.
       */
      const user = await queryOne<{
        id: number;
        email: string;
        first_name: string;
      }>(
        isNumeric
          ? `SELECT id, email, first_name
               FROM public.users
              WHERE cc = $1
                AND id_state = 1`
          : `SELECT id, email, first_name
               FROM public.users
              WHERE LOWER(email) = $1
                AND id_state = 1`,
        [identifier]
      );

      // ── 3 & 4. Si no existe o no tiene email, respuesta neutra ───────────
      if (!user || !user.email) {
        console.info("[forgot-password] Usuario no encontrado o sin correo:", {
          identifier,   // seguro loguear aquí porque solo llega a logs del servidor
        });
        // Respuesta idéntica a la del éxito → no revela si el usuario existe
        return res.json({
          message: "Si el identificador existe, recibirás las instrucciones al correo registrado.",
        });
      }

      // ── 5. Generar contraseña temporal segura ────────────────────────────
      const tempPassword = generateTempPassword();
      const hashedPassword = sha256(tempPassword);

      // ── 6. Actualizar contraseña en BD + registrar fecha de reset ─────────
      /*
       * SENTENCIA PREPARADA — actualiza SOLO password y password_reset_at
       * del usuario identificado por su ID interno (no por CC ni email).
       *
       * password_reset_at permite auditar cuándo se hizo el último reset.
       *
       * IMPORTANTE: Si la columna password_reset_at no existe aún en tu BD,
       * ejecuta la siguiente migración:
       *
       *   ALTER TABLE public.users
       *     ADD COLUMN IF NOT EXISTS password_reset_at TIMESTAMPTZ;
       *
       * Si prefieres no agregar la columna por ahora, usa la versión
       * sin password_reset_at comentada debajo.
       */
      await query(
        `UPDATE public.users
            SET password          = $1,
                password_reset_at = NOW()
          WHERE id = $2`,
        [hashedPassword, user.id]
      );

      /*
       * Versión alternativa SIN password_reset_at (si no agregaste la columna):
       *
       * await query(
       *   `UPDATE public.users SET password = $1 WHERE id = $2`,
       *   [hashedPassword, user.id]
       * );
       */

      // ── 7. Enviar correo con la contraseña temporal en texto plano ────────
      /*
       * El correo se envía DESPUÉS de actualizar la BD para garantizar que
       * si el correo falla, la contraseña en BD ya fue cambiada. Así el
       * usuario puede reintentar y recibirá una nueva contraseña.
       *
       * La contraseña viaja en texto plano dentro del correo porque ese es
       * el flujo solicitado. Se recomienda que el usuario la cambie de
       * inmediato al ingresar (el sistema ya tiene ChangePasswordDialog).
       */
      try {
        await sendTemporaryPasswordEmail(
          user.email,
          user.first_name ?? "",
          tempPassword
        );
        console.info("[forgot-password] Contraseña temporal enviada a userId:", user.id);
      } catch (mailErr) {
        // Error de correo: la contraseña ya se actualizó, solo registramos
        console.error("[forgot-password] Error enviando correo (contraseña ya actualizada):", {
          userId: user.id,
          error: mailErr instanceof Error ? mailErr.message : mailErr,
        });
      }

      // Respuesta de éxito siempre (la contraseña ya se actualizó)
      return res.json({
        message: "Si el identificador existe, recibirás las instrucciones al correo registrado.",
      });

    } catch (err) {
      console.error("[forgot-password] Error inesperado:", err);
      return res.status(500).json({ message: "Error procesando la solicitud" });
    }
  }
);

// ─── POST /api/auth/verify-password ────────────────────────────────────────

/**
 * Valida que la contraseña actual coincida con la del usuario autenticado.
 * Requiere JWT válido.
 */
router.post("/verify-password", requireAuth, async (req: AuthRequest, res: Response) => {
  const { currentPassword } = req.body ?? {};

  if (!currentPassword || typeof currentPassword !== "string") {
    return res.status(400).json({ message: "Contraseña requerida" });
  }

  try {
    const hashed = sha256(currentPassword.slice(0, 128));

    /*
     * SENTENCIA PREPARADA — verificar contraseña del usuario autenticado.
     * El ID viene del JWT verificado, no del cuerpo de la petición.
     */
    const user = await queryOne<{ id: number }>(
      `SELECT id FROM public.users WHERE id = $1 AND password = $2 AND id_state = 1`,
      [req.user!.id, hashed]
    );

    if (!user) {
      return res.status(401).json({ message: "Contraseña actual incorrecta" });
    }

    return res.json({ valid: true });
  } catch (err) {
    console.error("[verify-password] Error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── POST /api/auth/change-password ────────────────────────────────────────

/**
 * Cambia la contraseña del usuario autenticado.
 * Re-valida la contraseña actual antes de actualizar.
 * Requiere JWT válido.
 */
router.post("/change-password", requireAuth, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};

  // Validaciones de entrada
  if (!currentPassword || typeof currentPassword !== "string") {
    return res.status(400).json({ message: "Contraseña actual requerida" });
  }
  if (!newPassword || typeof newPassword !== "string") {
    return res.status(400).json({ message: "Nueva contraseña requerida" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: "La nueva contraseña debe tener mínimo 8 caracteres" });
  }
  if (newPassword.length > 128) {
    return res.status(400).json({ message: "Contraseña demasiado larga" });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ message: "La nueva contraseña debe ser distinta a la actual" });
  }

  try {
    const hashedCurrent = sha256(currentPassword.slice(0, 128));

    /*
     * SENTENCIA PREPARADA — verificar contraseña actual antes del cambio.
     */
    const user = await queryOne<{ id: number }>(
      `SELECT id FROM public.users WHERE id = $1 AND password = $2 AND id_state = 1`,
      [req.user!.id, hashedCurrent]
    );

    if (!user) {
      return res.status(401).json({ message: "Contraseña actual incorrecta" });
    }

    const hashedNew = sha256(newPassword);

    /*
     * SENTENCIA PREPARADA — actualizar contraseña del usuario autenticado.
     */
    await query(
      `UPDATE public.users SET password = $1 WHERE id = $2`,
      [hashedNew, req.user!.id]
    );

    return res.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error("[change-password] Error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

export default router;