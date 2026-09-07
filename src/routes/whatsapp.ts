import { Router } from "express";
import twilio from "twilio";
import { processIncomingMessage } from "../lib/anthropic";
import { getRecentHistory, saveTurn } from "../services/conversation";
import { sendWhatsAppMessage } from "../lib/twilio";
import { tryCaptureSurveyResponse } from "../services/npsSurvey";
import { Sentry } from "../lib/sentry";

export const whatsappRouter = Router();

/**
 * Procesa el mensaje y envia la respuesta real por la API de Twilio, de forma
 * asincrona (fuera del ciclo request/response). Claude + herramientas puede
 * tardar varios segundos, y Twilio da por muerto el webhook si no responde
 * rapido (~15s) -- por eso el webhook contesta vacio de inmediato y esto se
 * ejecuta despues, sin bloquear esa respuesta.
 */
async function handleAndReply(from: string, body: string): Promise<void> {
  try {
    const { sessionId, history } = await getRecentHistory(from);
    const { reply } = await processIncomingMessage(from, sessionId, history, body);

    await saveTurn(sessionId, from, "user", body);
    await saveTurn(sessionId, from, "assistant", reply);

    await sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error("Error procesando mensaje de WhatsApp:", err);
    Sentry.captureException(err);
    await sendWhatsAppMessage(
      from,
      "Tuvimos un problema tecnico procesando tu mensaje. Un miembro del equipo lo revisara pronto.",
    ).catch((sendErr) => console.error("Error enviando el aviso de fallo:", sendErr));
  }
}

// Rechaza cualquier peticion que no venga realmente de Twilio (firma invalida
// o ausente). validate:false solo cuando se desactiva explicitamente para
// pruebas locales con curl.
const validateTwilioSignature = twilio.webhook({
  validate: process.env.TWILIO_VALIDATE_SIGNATURE !== "false",
});

whatsappRouter.post("/webhook/whatsapp", validateTwilioSignature, (req, res) => {
  const from = req.body.From as string | undefined; // ej "whatsapp:+50688887777"
  const body = (req.body.Body as string | undefined)?.trim();

  // Se responde vacio de inmediato para que Twilio no expire el webhook
  // esperando a Claude. La respuesta real se manda aparte por la API REST.
  const twiml = new twilio.twiml.MessagingResponse();
  res.type("text/xml").send(twiml.toString());

  if (!from || !body) return;

  void (async () => {
    // Si hay una encuesta NPS pendiente y esto parece ser la respuesta, se
    // captura directamente sin pasar por Claude -- no es una conversacion.
    const handledAsSurvey = await tryCaptureSurveyResponse(from, body).catch((err) => {
      console.error("Error procesando posible respuesta de encuesta NPS:", err);
      Sentry.captureException(err);
      return false;
    });
    if (handledAsSurvey) return;

    await handleAndReply(from, body);
  })();
});
