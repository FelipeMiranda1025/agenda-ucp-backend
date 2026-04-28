import { Router, Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { query, queryOne } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { sendTemporaryPasswordEmail } from "../services/email";

const router = Router();

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** Genera contraseña temporal de 12 caracteres con may/min/dígito/especial. */
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*?";
  const all = upper + lower + digits + special;

  const pick = (set: string) => set[crypto.randomInt(0, set.length)];

  const required = [pick(upper), pick(lower), pick(digits), pick(special)];
  const remaining: string[] = [];
  for (let i = 0; i < 8; i++) remaining.push(pick(all));
  const arr = [...required, ...remaining];

  // Fisher-Yates shuffle con randomInt
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ message: "Usuario y contraseña requeridos" });
  }
  try {
    const hashed = sha256(password);
    const user = await queryOne<any>(
      `SELECT id, cc, email, first_name, second_name, first_last_name, second_last_name,
              id_rol, id_state
         FROM public.users
        WHERE (cc = $1 OR email = $1)
          AND password = $2
          AND id_state = 1`,
      [username, hashed]
    );
    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ message: "JWT_SECRET no configurado" });
    }
    const token = jwt.sign(
      { id: user.id, cc: user.cc, rolId: user.id_rol },
      secret,
      { expiresIn: "8h" }
    );
    return res.json({
      token,
      user: {
        id: user.id,
        cc: user.cc,
        email: user.email,
        firstName: user.first_name,
        secondName: user.second_name,
        firstLastName: user.first_last_name,
        secondLastName: user.second_last_name,
        rolId: user.id_rol,
        statusId: user.id_state,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne<any>(
      `SELECT id, cc, email, first_name, second_name, first_last_name, second_last_name,
              id_rol, id_state
         FROM public.users WHERE id = $1`,
      [req.user!.id]
    );
    if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({
      id: user.id,
      cc: user.cc,
      email: user.email,
      firstName: user.first_name,
      secondName: user.second_name,
      firstLastName: user.first_last_name,
      secondLastName: user.second_last_name,
      rolId: user.id_rol,
      statusId: user.id_state,
    });
  } catch {
    return res.status(500).json({ message: "Error interno" });
  }
});

/**
 * POST /api/auth/forgot-password
 * Body: { identifier: string }  // cédula o correo institucional
 *
 * Flujo:
 * 1. Busca el usuario por cc o email (id_state = 1).
 * 2. Genera contraseña temporal segura.
 * 3. Guarda la contraseña hasheada (SHA-256) en users.password.
 * 4. Envía la contraseña en texto plano al correo del usuario.
 */
router.post("/forgot-password", async (req: Request, res: Response) => {
  const rawIdentifier = (req.body?.identifier ?? req.body?.email ?? "").toString().trim();
  if (!rawIdentifier || rawIdentifier.length < 4 || rawIdentifier.length > 100) {
    return res.status(400).json({ message: "Identificador inválido" });
  }

  try {
    const isNumeric = /^\d+$/.test(rawIdentifier);
    const user = await queryOne<any>(
      isNumeric
        ? `SELECT id, cc, email, first_name FROM public.users WHERE cc = $1 AND id_state = 1`
        : `SELECT id, cc, email, first_name FROM public.users WHERE email = $1 AND id_state = 1`,
      [isNumeric ? rawIdentifier : rawIdentifier.toLowerCase()]
    );

    // Respuesta neutra si no existe (no revelar)
    if (!user || !user.email) {
      console.log("[forgot-password] usuario no encontrado o sin correo:", rawIdentifier);
      return res.json({
        message: "Si el correo existe, recibirás las instrucciones",
      });
    }

    const tempPassword = generateTempPassword();
    const hashed = sha256(tempPassword);

    // Actualizar contraseña en BD
    await query(`UPDATE public.users SET password = $1 WHERE id = $2`, [
      hashed,
      user.id,
    ]);

    // Enviar correo con contraseña en texto plano
    try {
      await sendTemporaryPasswordEmail(user.email, user.first_name ?? "", tempPassword);
    } catch (mailErr) {
      console.error("[forgot-password] Error enviando correo:", mailErr);
      return res.status(500).json({
        message:
          "No se pudo enviar el correo. Verifica la configuración SMTP del servidor o intenta nuevamente.",
      });
    }

    return res.json({
      message: "Se envió la nueva contraseña al correo",
    });
  } catch (err) {
    console.error("[forgot-password] Error:", err);
    return res.status(500).json({ message: "Error procesando la solicitud" });
  }
});

/**
 * POST /api/auth/verify-password
 * Body: { currentPassword: string }
 * Valida que la contraseña actual coincida con la del usuario autenticado.
 */
router.post("/verify-password", requireAuth, async (req: AuthRequest, res: Response) => {
  const { currentPassword } = req.body ?? {};
  if (!currentPassword || typeof currentPassword !== "string") {
    return res.status(400).json({ message: "Contraseña requerida" });
  }
  try {
    const hashed = sha256(currentPassword);
    const user = await queryOne<any>(
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

/**
 * POST /api/auth/change-password
 * Body: { currentPassword: string, newPassword: string }
 * Re-valida la contraseña actual y actualiza la nueva en BD.
 */
router.post("/change-password", requireAuth, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || typeof currentPassword !== "string") {
    return res.status(400).json({ message: "Contraseña actual requerida" });
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
    return res.status(400).json({ message: "La nueva contraseña debe tener mínimo 8 caracteres" });
  }
  if (newPassword === currentPassword) {
    return res.status(400).json({ message: "La nueva contraseña debe ser distinta a la actual" });
  }
  if (newPassword.length > 128) {
    return res.status(400).json({ message: "Contraseña demasiado larga" });
  }
  try {
    const hashedCurrent = sha256(currentPassword);
    const user = await queryOne<any>(
      `SELECT id FROM public.users WHERE id = $1 AND password = $2 AND id_state = 1`,
      [req.user!.id, hashedCurrent]
    );
    if (!user) {
      return res.status(401).json({ message: "Contraseña actual incorrecta" });
    }
    const hashedNew = sha256(newPassword);
    await query(`UPDATE public.users SET password = $1 WHERE id = $2`, [
      hashedNew,
      req.user!.id,
    ]);
    return res.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error("[change-password] Error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

export default router;
