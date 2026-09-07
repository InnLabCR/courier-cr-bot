import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  throw new Error("Faltan TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN en el entorno");
}

export const twilioClient = twilio(accountSid, authToken);

export const COURIER_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER ?? "";

function toWhatsApp(number: string): string {
  return number.startsWith("whatsapp:") ? number : `whatsapp:${number}`;
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<void> {
  if (!COURIER_WHATSAPP_NUMBER) {
    throw new Error("Falta TWILIO_WHATSAPP_NUMBER en el entorno");
  }
  await twilioClient.messages.create({
    from: toWhatsApp(COURIER_WHATSAPP_NUMBER),
    to: toWhatsApp(to),
    body,
  });
}
