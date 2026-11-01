import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getTrackingProvider, PackageSnapshot } from "./trackingProvider";
import { listActiveShippingRates, listActiveFaqEntries, STATUS_LABELS } from "../services/packages";
import { notifyEscalation, resolveLatestEscalation } from "../services/notifications";
import { closeSession } from "../services/conversation";

const client = new Anthropic();

const COURIER_NAME = process.env.COURIER_NAME ?? "el courier";
const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";
const EFFORT = (process.env.CLAUDE_EFFORT as "low" | "medium" | "high") ?? "medium";

function buildSystemPrompt(): string {
  return `Eres el asistente virtual de WhatsApp de ${COURIER_NAME}. Tu trabajo principal es dar seguimiento a paquetes (decirle al cliente en que estado va su envio) y responder consultas generales (tarifas, cobertura, como enviar un paquete, tiempos de entrega, reclamos).

Reglas generales de conversacion:
- Formato de la respuesta: NO escribas ningun texto antes de llamar una herramienta (nada de "dejame revisar...", "voy a consultar..."); llama la herramienta directamente y, cuando tengas su resultado, escribe UN solo mensaje final, completo, con todo lo que el cliente necesita saber. No repitas la misma idea dos veces en el mismo mensaje (ej. no digas "te conecto con un asesor" y luego "un asesor te contactara" por separado).
- Responde siempre en espanol, en tono calido y profesional. Por defecto ve directo al grano (esto es WhatsApp, no un correo), pero cuando haga falta explicar algo (una demora, una duda, un "por que") tienes espacio para desarrollar la idea en 2-3 oraciones en vez de una linea seca -- prioriza que la respuesta tenga sentido y resuelva la duda sobre que sea la mas corta posible.
- Cada conversacion es nueva e independiente: nunca asumas datos de una conversacion anterior con este numero, aunque el sistema los tenga guardados. Saluda siempre de forma formal al iniciar (como si fuera la primera vez que hablas con quien escribe).
- Nunca inventes el estado de un paquete, tarifas, ni politicas: siempre consulta las herramientas (tools) para obtener datos reales y actualizados. El estado de un paquete SOLO se obtiene con track_package -- jamas lo asumas ni lo repitas de memoria si paso tiempo desde la ultima consulta.
- Si el mensaje del cliente es corto o ambiguo (ej. solo manda un numero o codigo sin contexto), asume que es un numero de guia/tracking y consultalo con track_package -- si no existe, ahi si pregunta que necesita.
- NUNCA prometas fechas de entrega exactas que no vengan de track_package, ni des explicaciones tecnicas/legales de aduanas que no manejes con certeza -- en eso escala a un humano con escalate_to_human.
- Cuando algo falle (ej. numero de guia no encontrado) o el cliente pregunte "por que" o no este de acuerdo con algo, no te quedes en una respuesta plana ni repitas el mismo mensaje: explica la razon real con tus propias palabras, de forma natural y conversacional, y proactivamente ofrece la siguiente accion util (revisar el numero, reintentar, escalar). Usa escalate_to_human solo cuando genuinamente no tengas forma de resolverlo con tus herramientas -- no lo uses como salida facil solo porque el cliente insistio o hizo una pregunta de seguimiento que si puedes responder razonando.
- Escala a un humano con escalate_to_human cuando: el paquete parece perdido o con una incidencia sin resolver por mucho tiempo, el cliente reporta un paquete danado, quiere poner un reclamo formal, esta genuinamente molesto sin que puedas resolverlo, esta confundido de forma persistente, pide explicitamente hablar con una persona, o pide un tramite/gestion que claramente no manejas por WhatsApp (ej. abrir o gestionar un casillero, cambios de cuenta, facturacion, y similares -- cualquier cosa fuera de rastreo/tarifas/info general que requiera que una persona lo atienda).
- IMPORTANTE: cuando la solicitud sea claramente algo que no puedes resolver tu (un tramite que solo hace un humano, algo fuera de tu alcance), NO le preguntes al cliente si quiere que lo transfieras -- eso agrega un paso de ida y vuelta innecesario. Tu mensaje final DEBE tener, en este orden, las tres partes siguientes (nunca te saltes la parte 2 -- no basta con confirmar la transferencia, tienes que decir primero y explicitamente que tu no lo puedes hacer):
  1. Reconoce puntualmente lo que te pidio, nombrandolo (no generico).
  2. Dile EXPLICITAMENTE, con esas o parecidas palabras, que "eso no lo puedo hacer/gestionar yo" -- esta frase de que TU no puedes es obligatoria, no la omitas ni la des por sobreentendida.
  3. Dile que ya lo estas conectando con un asesor humano que si puede ayudarlo con eso.
  Y llama a escalate_to_human de una vez en ese mismo turno (no esperes a que confirme). Ejemplo (el cliente pidio abrir un casillero): "¡Hola! La apertura de casilleros es un tramite que yo no puedo gestionar por aqui, pero ya te conecto con un asesor humano de nuestro equipo para que te ayude con eso." Una respuesta que solo dice "listo, ya te contactara alguien" SIN antes decir que tu no puedes hacerlo esta INCOMPLETA -- corrigela. La pregunta "¿quieres que te transfiera?" solo tiene sentido en casos ambiguos donde no esta claro si el cliente realmente quiere escalar (ej. esta frustrado pero tal vez tu si puedas resolverlo) -- para pedidos claramente fuera de tu alcance, actua directo mencionando siempre que tu no puedes hacerlo.
- Si escalaste antes en esta misma conversacion y despues, sin necesitar a un humano, terminas resolviendo exactamente lo que la habia motivado (ej. escalaste porque el cliente no tenia el numero de guia, y unos mensajes despues lo encontro y ya le diste el estado de su paquete), llama a resolve_own_escalation -- asi el staff no pierde tiempo contactando a alguien que ya quedo atendido.
- Cuando la conversacion llegue a su fin natural -- el cliente dice "gracias", "no gracias", "eso es todo", se despide, o ya resolviste lo que necesitaba y confirma que no necesita nada mas -- responde la despedida normalmente Y ADEMAS llama a end_conversation. Esto es importante: si no la llamas, un "Hola" que el cliente escriba poco despues puede retomar el tema ya cerrado en vez de saludar de cero, que es justo lo que no queremos.

Flujo para RASTREAR un paquete:
1. Pide el numero de guia/tracking si no lo dio (puede venir con o sin espacios/guiones -- no te preocupes por el formato exacto, la herramienta lo normaliza).
2. Llama track_package con ese numero. Si existe, resume el estado actual y el ultimo movimiento en tu propia voz (no pegues el texto crudo de la herramienta tal cual, hazlo sonar natural). Si el cliente pregunta detalles del historial completo, compartelo.
3. Si no existe ese numero de guia, dile amablemente que no lo encontraste y pidele que revise que este correcto (puede tener un error de digitacion); si insiste en que es correcto y no aparece, ofrece escalar a un humano.

4. Si el cliente dice que NO tiene el numero de guia, NO escales todavia ni llames a escalate_to_human: explicale donde suele encontrarlo (correo o mensaje de confirmacion, comprobante, quien le hizo el envio) y pidele que te lo pase cuando lo tenga. Escala solo si el pide hablar con una persona o si de plano no logra encontrarlo y lo pide o insiste.

Flujo para CONSULTAS GENERALES (tarifas, cobertura, como enviar un paquete, politicas):
- Usa get_shipping_rates para preguntas de precio.
- Usa get_general_info para horarios, zonas de cobertura, requisitos para enviar/recibir, politica de reclamos, y cualquier otra pregunta frecuente -- ahi esta la informacion oficial configurada por el equipo. Si la pregunta no esta cubierta ahi y no la puedes responder con certeza, no inventes: dilo con naturalidad y ofrece escalar si hace falta.

Nunca prometas acciones que no puedas ejecutar con tus herramientas (ej. "voy a acelerar tu envio" o "te lo entrego hoy mismo") -- eso solo lo puede decidir el equipo humano.`;
}

const LOOKUP_TOOLS = new Set(["track_package", "get_shipping_rates", "get_general_info"]);

const tools = [
  betaZodTool({
    name: "get_shipping_rates",
    description:
      "Obtiene la lista de tarifas/servicios de envio que ofrece el courier junto con su precio. Usar cuando el cliente pregunte por precios, cuanto cuesta enviar algo, o que tipos de servicio existen.",
    inputSchema: z.object({}),
    run: async () => {
      const rates = await listActiveShippingRates();
      if (rates.length === 0) return "No hay tarifas configuradas todavia.";
      return rates
        .map((r) => `- ${r.name}: ${(r.priceCents / 100).toLocaleString("es-CR")} ${r.currency}${r.description ? ` (${r.description})` : ""}`)
        .join("\n");
    },
  }),
  betaZodTool({
    name: "get_general_info",
    description:
      "Obtiene la base de conocimiento general del courier (horarios de atencion, zonas de cobertura, como enviar/recibir un paquete, politica de reclamos por paquetes perdidos o danados, etc). Usar para cualquier pregunta frecuente que no sea sobre un paquete especifico ni sobre precios.",
    inputSchema: z.object({}),
    run: async () => {
      const entries = await listActiveFaqEntries();
      if (entries.length === 0) return "No hay informacion general configurada todavia.";
      return entries.map((e) => `[${e.topic}]\n${e.answer}`).join("\n\n");
    },
  }),
  betaZodTool({
    name: "track_package",
    description:
      "Consulta el estado actual y el historial de movimientos de un paquete por su numero de guia/tracking. Esta es la herramienta principal del bot -- usala en cuanto el cliente proporcione o parezca haber dado un numero de guia. Nunca inventes ni asumas el estado de un paquete sin llamar esta herramienta.",
    inputSchema: z.object({
      trackingNumber: z.string().describe("Numero de guia/tracking proporcionado por el cliente"),
    }),
    run: async ({ trackingNumber }) => {
      const snapshot = await getTrackingProvider().getStatus(trackingNumber);
      if (!snapshot) {
        return `No se encontro ningun paquete con el numero de guia "${trackingNumber}". Pide al cliente que revise que el numero este correcto.`;
      }
      return formatSnapshot(snapshot);
    },
  }),
];

function formatSnapshot(snapshot: PackageSnapshot): string {
  const lines = [`Guia: ${snapshot.trackingNumber}`, `Estado actual: ${STATUS_LABELS[snapshot.status]}`];

  if (snapshot.description) lines.push(`Contenido: ${snapshot.description}`);
  if (snapshot.originCity || snapshot.destinationCity) {
    lines.push(`Ruta: ${snapshot.originCity ?? "origen no especificado"} -> ${snapshot.destinationCity ?? "destino no especificado"}`);
  }
  if (snapshot.carrier) lines.push(`Transportista: ${snapshot.carrier}`);
  if (snapshot.estimatedDelivery) {
    lines.push(
      `Entrega estimada: ${new Date(snapshot.estimatedDelivery).toLocaleDateString("es-CR", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
      })}`,
    );
  }

  const recentEvents = snapshot.events.slice(-4).reverse();
  if (recentEvents.length > 0) {
    lines.push("Ultimos movimientos (mas reciente primero):");
    for (const e of recentEvents) {
      const when = new Date(e.occurredAt).toLocaleString("es-CR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      lines.push(`- ${when} · ${STATUS_LABELS[e.status]}${e.location ? ` (${e.location})` : ""}${e.note ? ` -- ${e.note}` : ""}`);
    }
  }

  return lines.join("\n");
}

/**
 * Herramientas que dependen del numero de telefono / sesion de la
 * conversacion actual (para que el modelo nunca pueda cerrar la sesion de
 * otra persona ni escalar sin saber a quien responderle).
 */
function buildScopedTools(phone: string, sessionId: string) {
  return [
    ...tools,
    betaZodTool({
      name: "escalate_to_human",
      description:
        "Marca la conversacion para que un miembro del equipo de operaciones la atienda personalmente. Usar cuando no puedas resolver la solicitud con tus herramientas, cuando el cliente reporte un paquete perdido/danado o quiera poner un reclamo formal, pida explicitamente hablar con una persona, o pida un tramite fuera de tu alcance (ej. abrir/gestionar un casillero, cuenta, facturacion). Para estos casos claros, llamala de una vez en el mismo turno -- no le preguntes antes al cliente si quiere que lo transfieras.",
      inputSchema: z.object({
        reason: z.string().describe("Motivo breve del escalamiento, para que el staff tenga contexto"),
      }),
      run: async ({ reason }) => {
        await notifyEscalation(phone, reason);
        return "Escalamiento registrado -- un miembro del equipo contactara al cliente. Si en el texto que escribiste antes de llamar esta herramienta ya le explicaste al cliente que no puedes ayudarle con eso y que lo estas conectando con un asesor, responde ahora SOLO con una pregunta breve de cierre (ej. '¿Hay algo mas en lo que pueda ayudarte?') sin repetir la confirmacion. Si no le habias dicho nada, dile todo en un solo mensaje.";
      },
    }),
    betaZodTool({
      name: "resolve_own_escalation",
      description:
        "Marca como resuelta la escalacion mas reciente que TU MISMO hiciste antes en esta misma conversacion, porque acabas de terminar de resolver, sin necesitar a un humano, exactamente lo que la habia motivado (ej. escalaste porque el cliente no tenia el numero de guia, y unos mensajes despues lo encontro y ya le diste el estado de su paquete). Esto evita que el staff contacte al cliente innecesariamente. NO la uses si la escalacion sigue siendo necesaria o trata de otra cosa distinta a lo que acabas de resolver.",
      inputSchema: z.object({
        note: z.string().optional().describe("Breve nota de como se resolvio, para el registro del staff"),
      }),
      run: async ({ note }) => {
        const resolved = await resolveLatestEscalation(phone, note);
        return resolved
          ? "Escalacion anterior marcada como resuelta -- el staff ya no necesita contactar al cliente por eso. Si en el texto que escribiste antes de llamar esta herramienta ya le diste al cliente el resultado (ej. el estado de su paquete) y le avisaste que cancelaste la asistencia humana, responde ahora SOLO con una pregunta breve de cierre; si no, dile todo en un solo mensaje."
          : "No habia ninguna escalacion abierta para este cliente.";
      },
    }),
    betaZodTool({
      name: "end_conversation",
      description:
        "Cierra la conversacion actual porque llego a su fin natural (el cliente se despidio, dijo gracias/no necesita nada mas, o ya se resolvio su solicitud). Llamar esto DESPUES de responder la despedida. La proxima vez que este numero escriba, empezara una conversacion completamente nueva.",
      inputSchema: z.object({}),
      run: async () => {
        await closeSession(sessionId);
        return "Conversacion cerrada (no se lo menciones al cliente). Si ya te despediste en el texto que escribiste antes de llamar esta herramienta, responde solo con '👋'; si no, despidete ahora brevemente.";
      },
    }),
  ];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ProcessResult {
  reply: string;
}

export async function processIncomingMessage(
  phone: string,
  sessionId: string,
  history: ChatTurn[],
  userMessage: string,
): Promise<ProcessResult> {
  const inputMessages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: userMessage },
  ];

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(),
    output_config: { effort: EFFORT },
    tools: buildScopedTools(phone, sessionId),
    messages: inputMessages,
  });

  await runner;

  // El runner puede generar varios turnos del asistente en un mismo
  // intercambio (ej. uno que explica algo Y llama una herramienta, seguido
  // de otro turno corto una vez que ve el resultado de la herramienta) --
  // leer solo el ultimo turno (como se hacia antes) pierde el texto de los
  // turnos intermedios. Se junta el texto de TODOS los turnos del asistente
  // generados en este intercambio (no los del historial previo, por eso se
  // hace slice desde donde terminaban los mensajes de entrada).
  //
  // Excepcion: el texto que acompana una llamada a SOLO herramientas de consulta
  // (rastreo, tarifas, info) es relleno tipo "dejame revisar..." y se descarta;
  // el texto que acompana cualquier otra herramienta (escalar, resolver una
  // escalacion, cerrar la conversacion) se conserva porque ahi va el mensaje
  // real al cliente (la explicacion, la despedida).
  const assistantMessages = runner.params.messages
    .slice(inputMessages.length)
    .filter((m) => m.role === "assistant");
  const replyParts: string[] = [];
  assistantMessages.forEach((msg, index) => {
    if (typeof msg.content === "string") {
      replyParts.push(msg.content);
      return;
    }
    const toolNames = msg.content.flatMap((b) => (b.type === "tool_use" ? [b.name] : []));
    const isLastTurn = index === assistantMessages.length - 1;
    const onlyLookups = toolNames.length > 0 && toolNames.every((n) => LOOKUP_TOOLS.has(n));
    if (onlyLookups && !isLastTurn) return;
    for (const block of msg.content) {
      if (block.type === "text") replyParts.push(block.text);
    }
  });
  // Se quitan parrafos repetidos (ej. la misma pregunta de cierre dicha antes y
  // despues de una herramienta).
  const seen = new Set<string>();
  const reply = replyParts
    .join("\n\n")
    .split(/\n{2,}/)
    .filter((p) => {
      const key = p.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n\n")
    .trim();

  return { reply: reply || "Disculpa, no pude procesar tu mensaje. Un miembro del equipo te contactara pronto." };
}
