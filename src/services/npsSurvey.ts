import { PackageStatus, SurveyStatus } from "@prisma/client";
import { db } from "../lib/db";
import { sendWhatsAppMessage } from "../lib/twilio";
import { Sentry } from "../lib/sentry";

// Se manda entre 2 y 26 horas despues de que el paquete se marco como
// entregado -- suficiente margen para que el cliente ya lo haya recibido,
// sin esperar tanto que se le olvide la experiencia.
const SURVEY_WINDOW_FROM_HOURS = 2;
const SURVEY_WINDOW_TO_HOURS = 26;

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** Manda la encuesta de satisfaccion (NPS) a paquetes ya entregados que aun no la reciben. */
export async function sendPendingSatisfactionSurveys(): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(now - SURVEY_WINDOW_TO_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(now - SURVEY_WINDOW_FROM_HOURS * 60 * 60 * 1000);

  const candidates = await db.package.findMany({
    where: {
      status: PackageStatus.DELIVERED,
      survey: null,
      recipientPhone: { not: null },
    },
    include: {
      events: { where: { status: PackageStatus.DELIVERED }, orderBy: { occurredAt: "desc" }, take: 1 },
    },
  });

  for (const pkg of candidates) {
    const deliveredAt = pkg.events[0]?.occurredAt;
    if (!deliveredAt || deliveredAt < windowStart || deliveredAt > windowEnd) continue;
    if (!pkg.recipientPhone) continue;

    const nombre = pkg.recipientName ? firstName(pkg.recipientName) : "";
    const text =
      `Hola${nombre ? " " + nombre : ""}! 👋 Vimos que tu paquete (guía ${pkg.trackingNumber}) ya fue entregado. ` +
      "Del 1 al 10, ¿qué tan satisfecho quedaste con el servicio? Responde solo con el número. 🙏";

    try {
      await sendWhatsAppMessage(pkg.recipientPhone, text);
    } catch (err) {
      console.error(`Error enviando encuesta NPS a ${pkg.recipientPhone}:`, err);
      Sentry.captureException(err);
      continue;
    }

    await db.satisfactionSurvey.create({
      data: {
        packageId: pkg.id,
        phone: pkg.recipientPhone,
        status: SurveyStatus.PENDING,
      },
    });
  }
}

/**
 * Si este numero tiene una encuesta pendiente y el mensaje que mando parece
 * ser la respuesta (empieza con un numero del 0 al 10), la captura y
 * responde directamente -- sin pasar por Claude. Devuelve true si lo manejo.
 */
export async function tryCaptureSurveyResponse(phone: string, body: string): Promise<boolean> {
  const pending = await db.satisfactionSurvey.findFirst({
    where: { phone, status: SurveyStatus.PENDING },
    orderBy: { sentAt: "desc" },
  });
  if (!pending) return false;

  const match = body.trim().match(/^(10|[0-9])\b/);
  if (!match) return false; // no parece respuesta numerica -- se deja pasar al flujo normal del bot

  const score = Number.parseInt(match[1], 10);
  const comment = body.trim().slice(match[0].length).trim() || null;

  await db.satisfactionSurvey.update({
    where: { id: pending.id },
    data: { status: SurveyStatus.RESPONDED, respondedAt: new Date(), score, comment },
  });

  await sendWhatsAppMessage(phone, "¡Muchas gracias por tu respuesta! 🙏 Tu opinión nos ayuda a mejorar.");
  return true;
}
