import nodemailer, { Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  const port = Number(process.env.SMTP_PORT ?? 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return transporter;
}

const FROM =
  process.env.SMTP_FROM ?? '"Agenda Docente UCP" <no-reply@ucp.edu.co>';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Envía la nueva contraseña temporal al docente en TEXTO PLANO dentro de un
 * correo HTML institucional UCP. La contraseña ya quedó actualizada (hasheada)
 * en la base de datos antes de invocar esta función.
 */
export async function sendTemporaryPasswordEmail(
  to: string,
  firstName: string,
  tempPassword: string
): Promise<void> {
  const safeName = escapeHtml(firstName?.trim() || "Docente");
  const safePwd = escapeHtml(tempPassword);

  const html = `
  <!doctype html>
  <html lang="es">
    <body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f6f9;padding:32px 0;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.05);">
              <tr>
                <td style="background:#0a4d8c;padding:24px 32px;color:#ffffff;font-size:18px;font-weight:bold;">
                  Agenda Docente — Universidad Católica de Pereira
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  <h2 style="margin:0 0 16px;font-size:20px;color:#0a4d8c;">Hola, ${safeName}</h2>
                  <p style="margin:0 0 16px;line-height:1.5;">
                    Recibimos una solicitud para restablecer tu contraseña en el
                    Sistema de Agenda Docente. A continuación encontrarás tu
                    <strong>nueva contraseña temporal</strong>.
                  </p>

                  <div style="margin:24px 0;padding:18px 20px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;text-align:center;">
                    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">
                      Tu nueva contraseña
                    </p>
                    <p style="margin:0;font-family:'Courier New',Consolas,monospace;font-size:22px;font-weight:bold;color:#0a4d8c;letter-spacing:2px;word-break:break-all;">
                      ${safePwd}
                    </p>
                  </div>

                  <p style="margin:0 0 16px;line-height:1.5;">
                    Inicia sesión con esta contraseña usando tu cédula o correo
                    institucional. Por seguridad, te recomendamos
                    <strong>cambiarla</strong> tan pronto ingreses al sistema.
                  </p>

                  <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">
                    Si tú no solicitaste este cambio, comunícate de inmediato con
                    el área de soporte académico para asegurar tu cuenta.
                  </p>

                  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;" />
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                    Sistema de Agenda Docente · Universidad Católica de Pereira
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;

  const text =
    `Hola ${firstName || "Docente"},\n\n` +
    `Recibimos una solicitud para restablecer tu contraseña en el Sistema ` +
    `de Agenda Docente UCP.\n\n` +
    `Tu nueva contraseña temporal es: ${tempPassword}\n\n` +
    `Inicia sesión con esta contraseña y, por seguridad, cámbiala apenas ` +
    `ingreses al sistema.\n\n` +
    `Si tú no solicitaste este cambio, contacta al soporte académico de la UCP.`;

  await getTransporter().sendMail({
    from: FROM,
    to,
    subject: "Nueva contraseña temporal — Agenda Docente UCP",
    text,
    html,
  });
}

/** Verifica conectividad SMTP (no bloquea el arranque si falla) */
export async function verifyEmailConnection(): Promise<void> {
  try {
    await getTransporter().verify();
    console.log("✅ Conexión SMTP verificada correctamente");
  } catch (err) {
    console.warn(
      "⚠️  No se pudo verificar SMTP (el servidor arrancó igual):",
      err
    );
  }
}
