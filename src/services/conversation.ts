import { ConversationRole, ConversationSessionStatus } from "@prisma/client";
import { db } from "../lib/db";
import { ChatTurn } from "../lib/anthropic";

const HISTORY_LIMIT = 20;

// Tiempo de inactividad antes de avisar / cerrar una conversacion. Al
// cerrarse, la siguiente vez que el cliente escriba se abre una sesion
// nueva sin memoria de la anterior (saludo formal, se piden datos de cero).
export const SESSION_WARNING_AFTER_MS = 8 * 60 * 1000;
export const SESSION_CLOSE_AFTER_MS = 10 * 60 * 1000;

async function getOrCreateOpenSession(phone: string) {
  const existing = await db.conversationSession.findFirst({
    where: { phone, status: ConversationSessionStatus.OPEN },
    orderBy: { startedAt: "desc" },
  });

  if (existing) {
    const inactiveMs = Date.now() - existing.lastMessageAt.getTime();
    if (inactiveMs < SESSION_CLOSE_AFTER_MS) {
      return existing;
    }
    // Ya paso el tiempo de cierre pero el barrido periodico aun no corria --
    // se cierra aqui mismo para no reusar una sesion vieja.
    await db.conversationSession.update({
      where: { id: existing.id },
      data: { status: ConversationSessionStatus.CLOSED, closedAt: new Date() },
    });
  }

  return db.conversationSession.create({ data: { phone } });
}

export interface SessionHistory {
  sessionId: string;
  history: ChatTurn[];
}

export async function getRecentHistory(phone: string): Promise<SessionHistory> {
  const session = await getOrCreateOpenSession(phone);
  const rows = await db.conversationMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  const history: ChatTurn[] = rows
    .reverse()
    .map((r) => ({ role: r.role === ConversationRole.USER ? "user" : "assistant", content: r.content }));
  return { sessionId: session.id, history };
}

/**
 * Cierra la sesion de inmediato (en vez de esperar el timer de inactividad).
 * Se usa cuando el propio bot detecta que la conversacion llego a su fin
 * natural (el cliente se despidio o ya no necesita nada mas) -- asi el
 * siguiente mensaje, aunque sea segundos despues, arranca completamente
 * fresco en vez de retomar un tema ya cerrado.
 */
export async function closeSession(sessionId: string): Promise<void> {
  await db.conversationSession.update({
    where: { id: sessionId },
    data: { status: ConversationSessionStatus.CLOSED, closedAt: new Date() },
  });
}

export async function saveTurn(
  sessionId: string,
  phone: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  await db.conversationMessage.create({
    data: {
      sessionId,
      phone,
      role: role === "user" ? ConversationRole.USER : ConversationRole.ASSISTANT,
      content,
    },
  });
  await db.conversationSession.update({
    where: { id: sessionId },
    data: {
      lastMessageAt: new Date(),
      // Si el cliente vuelve a escribir, se puede avisar de nuevo mas adelante si se queda callado otra vez.
      ...(role === "user" ? { warnedAt: null } : {}),
    },
  });
}
