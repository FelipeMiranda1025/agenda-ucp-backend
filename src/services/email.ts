/**
 * email.ts — Servicio de correo electrónico (Nodemailer)
 * ─────────────────────────────────────────────────────────────
 * Gestiona el transporter SMTP y las plantillas de correo.
 *
 * Seguridad implementada:
 *  - escapeHtml() en todos los valores dinámicos del HTML para
 *    prevenir XSS en clientes de correo que renderizan HTML.
 *  - El transporter se reinicia si las variables de entorno cambian
 *    (útil en recargas en caliente durante desarrollo).
 *  - Timeout configurado para evitar que el servidor quede colgado
 *    esperando respuesta del SMTP.
 *  - El texto plano (fallback) no contiene HTML, útil para clientes
 *    que solo muestran texto.
 * ─────────────────────────────────────────────────────────────
 */

import nodemailer, { Transporter } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

// Caché del transporter + snapshot de la config con la que fue creado
let transporter: Transporter | null = null;
let cachedSmtpConfig: string | null = null;

/**
 * Construye una clave de caché a partir de las variables SMTP actuales.
 * Si alguna cambia, se recreará el transporter.
 */
function getSmtpConfigKey(): string {
  return [
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_SECURE,
    process.env.SMTP_USER,
    process.env.SMTP_PASS,
  ].join("|");
}

/**
 * Devuelve (o crea) el transporter SMTP.
 * Lo recrea si la configuración SMTP cambió desde la última vez
 * (útil en desarrollo con nodemon/hot-reload).
 */
function getTransporter(): Transporter {
  const currentConfig = getSmtpConfigKey();

  // 1. Validar caché: si la configuración es la misma, retornamos el existente
  if (transporter && cachedSmtpConfig === currentConfig) {
    return transporter;
  }

  // 2. Limpieza: si existe un transporter previo (con otra config), lo cerramos
  if (transporter) {
    try {
      (transporter as any).close?.();
    } catch (e) {
      // Ignorar errores al cerrar conexiones viejas
    }
    transporter = null;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  // 3. Creación directa: aquí inyectamos la configuración con 'as any'
  // Esto elimina el error de 'host', 'pool' y cualquier otro de la línea 64
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
    pool: false,
  } as any);

  // 4. Actualizar caché y retornar
  cachedSmtpConfig = currentConfig;
  return transporter;
}

/** Dirección "From" leída de las variables de entorno */
const getFrom = (): string =>
  process.env.SMTP_FROM ?? '"Agenda Docente UCP" <no-reply@ucp.edu.co>';

/**
 * Escapa caracteres especiales de HTML para prevenir XSS en cuerpos de correo.
 * Se aplica a todos los valores dinámicos antes de insertarlos en la plantilla.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

// ─── Plantillas de correo ───────────────────────────────────────────────────

/**
 * Genera el cuerpo HTML del correo de contraseña temporal.
 * Todos los valores dinámicos pasan por escapeHtml().
 */
function buildPasswordEmailHtml(safeName: string, safePwd: string): string {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#f4f6f9;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation"
                 style="background:#ffffff;border-radius:8px;overflow:hidden;
                        box-shadow:0 2px 6px rgba(0,0,0,0.07);">

            <!-- Encabezado institucional -->
            <tr>
              <td style="background:#0a4d8c;padding:24px 32px;
                         color:#ffffff;font-size:18px;font-weight:bold;">
                Agenda Docente &mdash; Universidad Cat&oacute;lica de Pereira
              </td>
            </tr>

            <!-- Cuerpo -->
            <tr>
              <td style="padding:32px;">
                <h2 style="margin:0 0 16px;font-size:20px;color:#0a4d8c;">
                  Hola, ${safeName}
                </h2>
                <p style="margin:0 0 16px;line-height:1.6;">
                  Recibimos una solicitud para restablecer tu contrase&ntilde;a en el
                  <strong>Sistema de Agenda Docente</strong>. A continuaci&oacute;n
                  encontrar&aacute;s tu nueva contrase&ntilde;a temporal.
                </p>

                <!-- Caja de contraseña destacada -->
                <div style="margin:24px 0;padding:20px;background:#f3f4f6;
                            border:1px solid #e5e7eb;border-radius:8px;text-align:center;">
                  <p style="margin:0 0 8px;font-size:12px;color:#6b7280;
                             text-transform:uppercase;letter-spacing:0.8px;">
                    Tu nueva contrase&ntilde;a temporal
                  </p>
                  <p style="margin:0;font-family:'Courier New',Consolas,monospace;
                             font-size:24px;font-weight:bold;color:#0a4d8c;
                             letter-spacing:3px;word-break:break-all;">
                    ${safePwd}
                  </p>
                </div>

                <p style="margin:0 0 12px;line-height:1.6;">
                  Ingresa al sistema con esta contrase&ntilde;a usando tu c&eacute;dula
                  o correo institucional. Por seguridad,
                  <strong>c&aacute;mbiala inmediatamente</strong> luego de iniciar sesi&oacute;n
                  desde la opci&oacute;n <em>Cambiar Contrase&ntilde;a</em> en tu perfil.
                </p>

                <!-- Aviso de seguridad -->
                <div style="margin:20px 0;padding:14px 16px;background:#fff7ed;
                            border-left:4px solid #f97316;border-radius:4px;">
                  <p style="margin:0;font-size:13px;color:#9a3412;line-height:1.5;">
                    <strong>&#9888; Aviso de seguridad:</strong>
                    Si t&uacute; <em>no</em> solicitaste este cambio, comunícate de inmediato
                    con el &aacute;rea de soporte acad&eacute;mico para proteger tu cuenta.
                  </p>
                </div>

                <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
                <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                  Sistema de Agenda Docente &middot; Universidad Cat&oacute;lica de Pereira
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Genera el cuerpo en texto plano (fallback para clientes sin HTML).
 * No contiene HTML. La contraseña va sin escapar (es texto plano).
 */
function buildPasswordEmailText(firstName: string, tempPassword: string): string {
  return (
    `Hola ${firstName || "Docente"},\n\n` +
    `Recibimos una solicitud para restablecer tu contraseña en el Sistema de Agenda Docente UCP.\n\n` +
    `Tu nueva contraseña temporal es:\n\n` +
    `    ${tempPassword}\n\n` +
    `Ingresa con esta contraseña usando tu cédula o correo institucional.\n` +
    `Por seguridad, cámbiala inmediatamente luego de iniciar sesión.\n\n` +
    `AVISO: Si tú no solicitaste este cambio, contacta al soporte académico de la UCP de inmediato.\n\n` +
    `--\nSistema de Agenda Docente · Universidad Católica de Pereira`
  );
}

// ─── Función pública ────────────────────────────────────────────────────────

/**
 * Envía la contraseña temporal al usuario en un correo HTML institucional.
 *
 * La contraseña ya debe haber sido actualizada (hasheada) en la BD
 * antes de invocar esta función.
 *
 * @param to           Dirección de correo destino (ya validada)
 * @param firstName    Nombre del usuario para personalizar el saludo
 * @param tempPassword Contraseña temporal en texto plano
 *
 * @throws Error si el envío SMTP falla (el caller debe manejar el error)
 */
function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim());
}

function buildAgendaApprovedEmailHtml(
  safeName: string,
  scheduleUrl: string
): string {
  const safeUrl = escapeHtml(scheduleUrl);
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background:#f4f6f9;padding:32px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation"
                 style="background:#ffffff;border-radius:8px;overflow:hidden;
                        box-shadow:0 2px 6px rgba(0,0,0,0.07);">
            <tr>
              <td style="background:#0a4d8c;padding:24px 32px;
                         color:#ffffff;font-size:18px;font-weight:bold;">
                Agenda Docente &mdash; Universidad Cat&oacute;lica de Pereira
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h2 style="margin:0 0 16px;font-size:20px;color:#0a4d8c;">
                  Hola, ${safeName}
                </h2>
                <p style="margin:0 0 16px;line-height:1.6;">
                  Le informamos que su <strong>agenda docente</strong> ha sido
                  <strong>aprobada</strong> por todas las instancias del flujo de revisi&oacute;n
                  (director de programa, decano de facultad y vicerrector&iacute;a acad&eacute;mica,
                  seg&uacute;n corresponda a su caso).
                </p>
                <p style="margin:0 0 16px;line-height:1.6;">
                  Ya puede ingresar al sistema y diligenciar su
                  <strong>distribuci&oacute;n horaria semanal</strong> desde el men&uacute;
                  <em>Horario de permanencia</em> o la secci&oacute;n
                  <em>3.1 Distribuci&oacute;n horaria</em>.
                </p>
                <p style="margin:24px 0;text-align:center;">
                  <a href="${safeUrl}"
                     style="display:inline-block;padding:14px 28px;background:#0a4d8c;
                            color:#ffffff;text-decoration:none;border-radius:6px;
                            font-weight:bold;font-size:15px;">
                    Abrir distribuci&oacute;n horaria
                  </a>
                </p>
                <p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:1.5;">
                  Si el bot&oacute;n no funciona, copie este enlace en su navegador:<br />
                  <span style="word-break:break-all;">${safeUrl}</span>
                </p>
                <hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />
                <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                  Sistema de Agenda Docente &middot; Universidad Cat&oacute;lica de Pereira
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildAgendaApprovedEmailText(firstName: string, scheduleUrl: string): string {
  return (
    `Hola ${firstName || "Docente"},\n\n` +
    `Su agenda docente ha sido aprobada por todas las instancias del flujo de revisión.\n\n` +
    `Ya puede diligenciar su distribución horaria semanal en el Sistema de Agenda Docente UCP.\n\n` +
    `Enlace directo: ${scheduleUrl}\n\n` +
    `--\nSistema de Agenda Docente · Universidad Católica de Pereira`
  );
}

/**
 * Notifica al docente que su agenda fue aprobada en todos los niveles y puede
 * usar la distribución horaria semanal.
 */
export async function sendAgendaFullyApprovedEmail(
  to: string,
  firstName: string
): Promise<void> {
  if (!isSmtpConfigured()) {
    console.warn(
      "[agenda-approved-email] SMTP no configurado (SMTP_USER/SMTP_PASS); correo omitido"
    );
    return;
  }

  const base = (process.env.FRONTEND_URL ?? "http://localhost:8080").replace(/\/$/, "");
  const scheduleUrl = `${base}/schedule`;
  const safeName = escapeHtml((firstName?.trim() || "Docente").slice(0, 100));
  const html = buildAgendaApprovedEmailHtml(safeName, scheduleUrl);
  const text = buildAgendaApprovedEmailText(firstName?.trim() || "Docente", scheduleUrl);

  await getTransporter().sendMail({
    from: getFrom(),
    to,
    subject: "Agenda docente aprobada — distribución horaria habilitada",
    text,
    html,
    headers: {
      "X-Mailer": "AgendaDocente-UCP/1.0",
      "Auto-Submitted": "auto-generated",
    },
  });
}

export async function sendTemporaryPasswordEmail(
  to: string,
  firstName: string,
  tempPassword: string
): Promise<void> {
  // Sanitizar valores dinámicos para el HTML
  const safeName = escapeHtml((firstName?.trim() || "Docente").slice(0, 100));
  const safePwd  = escapeHtml(tempPassword);

  const html = buildPasswordEmailHtml(safeName, safePwd);
  const text = buildPasswordEmailText(firstName?.trim() || "Docente", tempPassword);

  // Intentar envío; si falla, el error se propaga al caller (auth.ts)
  await getTransporter().sendMail({
    from:    getFrom(),
    to,
    subject: "Nueva contraseña temporal — Agenda Docente UCP",
    text,
    html,
    // Cabeceras de seguridad adicionales
    headers: {
      "X-Mailer":           "AgendaDocente-UCP/1.0",
      "X-Priority":         "1",                         // alta prioridad
      "Auto-Submitted":     "auto-generated",            // indica correo automático
    },
  });
}

// ─── Función de diagnóstico ─────────────────────────────────────────────────

/**
 * Verifica la conectividad SMTP al arrancar el servidor.
 * No bloquea el inicio si falla — solo emite una advertencia.
 */
export async function verifyEmailConnection(): Promise<void> {
  try {
    await getTransporter().verify();
    console.log("✅  Conexión SMTP verificada correctamente");
  } catch (err) {
    console.warn(
      "⚠️   No se pudo verificar SMTP (el servidor arrancó de igual forma):",
      err instanceof Error ? err.message : err
    );
  }
}