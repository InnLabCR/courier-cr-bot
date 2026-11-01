import nodemailer from "nodemailer";
import { db } from "../lib/db";
import { sendWhatsAppMessage } from "../lib/twilio";
import { Sentry } from "../lib/sentry";

function getMailer() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

/**
 * A diferencia del bot de clinica (donde cada doctor tenia su propio contacto
 * en la base de datos), aqui el equipo de operaciones es uno solo, configurado
 * por variables de entorno -- no hace falta un modelo de "staff" en la base.
 */
async function notifyStaff(subject: string, text: string): Promise<void> {
  const tasks: Promise<unknown>[] = [];

  const staffWhatsapp = process.env.STAFF_WHATSAPP_NUMBER;
  if (staffWhatsapp) {
    tasks.push(
      sendWhatsAppMessage(staffWhatsapp, text).catch((err) => {
        console.error("Error enviando WhatsApp al staff:", err);
        Sentry.captureException(err);
      }),
    );
  }

  const mailer = getMailer();
  const staffEmail = process.env.STAFF_EMAIL;
  if (mailer && staffEmail) {
    tasks.push(
      mailer
        .sendMail({
          from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
          to: staffEmail,
          subject,
          text,
        })
        .catch((err) => {
          console.error("Error enviando correo al staff:", err);
          Sentry.captureException(err);
        }),
    );
  }

  await Promise.all(tasks);
}

export async function notifyEscalation(phone: string, reason: string): Promise<void> {
  // Se registra primero en la base de datos (para que el panel pueda listarla
  // y resolverla) y luego se notifica al staff -- si el envio de WhatsApp/correo
  // falla, el escalamiento igual queda registrado y visible en el panel.
  await db.escalation.create({ data: { phone, reason } });

  const text = `Un cliente necesita atencion humana.\nWhatsApp: ${phone.replace(
    "whatsapp:",
    "",
  )}\nMotivo: ${reason}`;
  await notifyStaff("Escalamiento a humano", text);
}

/**
 * Marca como resuelta la escalacion abierta mas reciente de este numero --
 * usado cuando el propio bot termina resolviendo, mas adelante en la MISMA
 * conversacion, lo que habia motivado la escalacion (ej. escalo porque el
 * cliente no tenia el numero de guia, y luego el cliente lo encontro y el bot
 * ya le dio el estado). Avisa al staff de que ya no hace falta que contacten
 * a ese cliente, para no duplicar esfuerzo.
 */
export async function resolveLatestEscalation(phone: string, note?: string): Promise<boolean> {
  const escalation = await db.escalation.findFirst({
    where: { phone, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  if (!escalation) return false;

  await db.escalation.update({
    where: { id: escalation.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  const text = `Una escalacion ya no requiere seguimiento -- el bot termino de resolverla el mismo, mas adelante en la conversacion.\nWhatsApp: ${phone.replace(
    "whatsapp:",
    "",
  )}\nMotivo original: ${escalation.reason}${note ? `\nComo se resolvio: ${note}` : ""}`;
  await notifyStaff("Escalamiento ya resuelto (no requiere contacto)", text);

  return true;
}
