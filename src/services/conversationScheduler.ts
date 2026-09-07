import { ConversationSessionStatus } from "@prisma/client";
import { db } from "../lib/db";
import { sendWhatsAppMessage } from "../lib/twilio";
import { SESSION_WARNING_AFTER_MS, SESSION_CLOSE_AFTER_MS } from "./conversation";
import { Sentry } from "../lib/sentry";

const SWEEP_INTERVAL_MS = 60 * 1000;

const INACTIVITY_WARNING_TEXT =
  "¿Sigues ahí? 👋 Esta conversación se va a cerrar por inactividad en unos minutos. Si necesitas algo más, escríbeme; si no, no te preocupes, la próxima vez que escribas simplemente empezamos de nuevo.";

export async function sweepOnce(): Promise<void> {
  const now = Date.now();
  const warningCutoff = new Date(now - SESSION_WARNING_AFTER_MS);
  const closeCutoff = new Date(now - SESSION_CLOSE_AFTER_MS);

  const toWarn = await db.conversationSession.findMany({
    where: {
      status: ConversationSessionStatus.OPEN,
      warnedAt: null,
      lastMessageAt: { lte: warningCutoff, gt: closeCutoff },
    },
  });

  for (const session of toWarn) {
    try {
      await sendWhatsAppMessage(session.phone, INACTIVITY_WARNING_TEXT);
    } catch (err) {
      console.error(`Error enviando aviso de inactividad a ${session.phone}:`, err);
      Sentry.captureException(err);
    }
    await db.conversationSession.update({
      where: { id: session.id },
      data: { warnedAt: new Date() },
    });
  }

  await db.conversationSession.updateMany({
    where: { status: ConversationSessionStatus.OPEN, lastMessageAt: { lte: closeCutoff } },
    data: { status: ConversationSessionStatus.CLOSED, closedAt: new Date() },
  });
}

/** Arranca el barrido periodico de conversaciones inactivas (aviso + cierre). */
export function startInactivitySweeper(): void {
  setInterval(() => {
    sweepOnce().catch((err) => {
      console.error("Error en el barrido de inactividad:", err);
      Sentry.captureException(err);
    });
  }, SWEEP_INTERVAL_MS);
}
