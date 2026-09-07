import { Router } from "express";
import rateLimit from "express-rate-limit";
import { processIncomingMessage } from "../lib/anthropic";
import { getRecentHistory, saveTurn } from "../services/conversation";

export const webchatRouter = Router();

const COURIER_NAME = process.env.COURIER_NAME ?? "Courier CR";

// Cada visitante de la demo es su propia "conversacion" identificada por un id
// aleatorio generado en el navegador (guardado en localStorage) -- se prefija
// con "web:" para que nunca pueda confundirse con un numero real de WhatsApp
// en el resto del sistema (notificaciones, encuestas NPS, etc. solo actuan
// sobre numeros que empiezan con "whatsapp:").
function toDemoPhone(visitorId: string): string {
  const clean = visitorId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return `web:${clean || "anonimo"}`;
}

// Este endpoint es publico (pensado para compartirselo al cliente sin friccion
// de login) y cada mensaje cuesta tokens de Claude -- se limita para evitar
// abuso, no para uso normal de una demo.
const messageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados mensajes en poco tiempo. Espera unos minutos e intenta de nuevo." },
});

webchatRouter.post("/demo/api/message", messageLimiter, async (req, res) => {
  const { visitorId, message } = req.body as { visitorId?: string; message?: string };
  const body = message?.trim();

  if (!visitorId || !body) {
    res.status(400).json({ error: "Falta visitorId o message" });
    return;
  }

  const phone = toDemoPhone(visitorId);

  try {
    const { sessionId, history } = await getRecentHistory(phone);
    const { reply } = await processIncomingMessage(phone, sessionId, history, body);

    await saveTurn(sessionId, phone, "user", body);
    await saveTurn(sessionId, phone, "assistant", reply);

    res.json({ reply });
  } catch (err) {
    console.error("Error procesando mensaje de la demo web:", err);
    res.status(500).json({
      reply: "Tuvimos un problema tecnico procesando tu mensaje. Intenta de nuevo en un momento.",
    });
  }
});

webchatRouter.get("/demo", (_req, res) => {
  res.send(renderDemoPage());
});

function renderDemoPage(): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${COURIER_NAME} · Demo de WhatsApp</title>
<style>
  :root {
    --wa-header: #075e54;
    --wa-header-dark: #054c44;
    --wa-bg: #e5ddd5;
    --wa-in: #ffffff;
    --wa-out: #dcf8c6;
    --wa-ink: #111b21;
    --wa-ink-muted: #667781;
    --wa-accent: #25d366;
    --page-bg: #f0f2f5;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --wa-header: #1f2c34;
      --wa-header-dark: #182228;
      --wa-bg: #0b141a;
      --wa-in: #202c33;
      --wa-out: #005c4b;
      --wa-ink: #e9edef;
      --wa-ink-muted: #8696a0;
      --page-bg: #111b21;
    }
  }
  * { box-sizing: border-box; }
  html, body {
    height: 100%;
    margin: 0;
    background: var(--page-bg);
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  }
  .page {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 12px;
    gap: 14px;
  }
  .disclaimer {
    max-width: 420px;
    text-align: center;
    font-size: 12.5px;
    color: var(--wa-ink-muted);
    line-height: 1.5;
  }
  .disclaimer b { color: var(--wa-ink); }
  .phone {
    width: 100%;
    max-width: 420px;
    height: min(760px, 88vh);
    background: var(--wa-bg);
    border-radius: 18px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0,0,0,0.25);
    border: 1px solid rgba(0,0,0,0.08);
  }
  .header {
    background: var(--wa-header);
    color: white;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .avatar {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    background: var(--wa-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    flex-shrink: 0;
  }
  .header .who { display: flex; flex-direction: column; line-height: 1.25; }
  .header .name { font-weight: 600; font-size: 15.5px; }
  .header .status { font-size: 12px; color: rgba(255,255,255,0.75); }
  .header .status.typing { color: rgba(255,255,255,0.95); }

  .thread {
    flex: 1;
    overflow-y: auto;
    padding: 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .day-chip {
    align-self: center;
    background: rgba(0,0,0,0.08);
    color: var(--wa-ink-muted);
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 8px;
    margin: 8px 0 14px;
  }
  .bubble-row { display: flex; margin: 2px 6px; }
  .bubble-row.in { justify-content: flex-start; }
  .bubble-row.out { justify-content: flex-end; }
  .bubble {
    max-width: 78%;
    padding: 7px 9px 6px 10px;
    border-radius: 8px;
    font-size: 14.3px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
    box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
    position: relative;
  }
  .bubble-row.in .bubble { background: var(--wa-in); color: var(--wa-ink); border-top-left-radius: 2px; }
  .bubble-row.out .bubble { background: var(--wa-out); color: var(--wa-ink); border-top-right-radius: 2px; }
  .bubble .time {
    display: block;
    text-align: right;
    font-size: 10.5px;
    color: var(--wa-ink-muted);
    margin-top: 3px;
    margin-left: 10px;
    float: right;
  }
  .bubble .txt { display: block; }

  .typing-row { display: flex; margin: 2px 6px; }
  .typing-bubble {
    background: var(--wa-in);
    border-radius: 8px;
    border-top-left-radius: 2px;
    padding: 10px 14px;
    display: flex;
    gap: 4px;
    box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
  }
  .typing-bubble span {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--wa-ink-muted);
    opacity: 0.5;
    animation: bounce 1.2s infinite;
  }
  .typing-bubble span:nth-child(2) { animation-delay: 0.15s; }
  .typing-bubble span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
    30% { transform: translateY(-4px); opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .typing-bubble span { animation: none; opacity: 0.8; }
  }

  .composer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: var(--page-bg);
    flex-shrink: 0;
  }
  .composer input {
    flex: 1;
    border: none;
    outline: none;
    border-radius: 22px;
    padding: 11px 16px;
    font-size: 14.5px;
    background: var(--wa-in);
    color: var(--wa-ink);
  }
  .composer button {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: none;
    background: var(--wa-accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
  }
  .composer button:disabled { opacity: 0.5; cursor: default; }
  .composer button svg { width: 19px; height: 19px; }
</style>
</head>
<body>
  <div class="page">
    <div class="phone">
      <div class="header">
        <div class="avatar">📦</div>
        <div class="who">
          <span class="name">${escapeHtml(COURIER_NAME)}</span>
          <span class="status" id="status">en línea</span>
        </div>
      </div>
      <div class="thread" id="thread">
        <div class="day-chip">Hoy</div>
      </div>
      <div class="composer">
        <input id="input" type="text" placeholder="Escribe un mensaje" autocomplete="off" />
        <button id="send" aria-label="Enviar">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
    <p class="disclaimer"><b>Esto es una simulación</b> para probar el bot sin necesitar WhatsApp real. Habla directo con la misma inteligencia artificial que usará el número de WhatsApp cuando esté conectado.</p>
  </div>

<script>
(function () {
  const thread = document.getElementById("thread");
  const input = document.getElementById("input");
  const sendBtn = document.getElementById("send");
  const status = document.getElementById("status");

  const VISITOR_KEY = "courier_demo_visitor_id";
  let visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = "demo-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(VISITOR_KEY, visitorId);
  }

  function timeNow() {
    return new Date().toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
  }

  function addBubble(text, who) {
    const row = document.createElement("div");
    row.className = "bubble-row " + (who === "user" ? "out" : "in");
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    const txt = document.createElement("span");
    txt.className = "txt";
    txt.textContent = text;
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = timeNow();
    bubble.appendChild(txt);
    bubble.appendChild(time);
    row.appendChild(bubble);
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
  }

  function showTyping() {
    const row = document.createElement("div");
    row.className = "typing-row";
    row.id = "typing-row";
    row.innerHTML = '<div class="typing-bubble"><span></span><span></span><span></span></div>';
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
  }
  function hideTyping() {
    const row = document.getElementById("typing-row");
    if (row) row.remove();
  }

  async function send() {
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    sendBtn.disabled = true;
    addBubble(message, "user");
    status.textContent = "escribiendo…";
    status.classList.add("typing");
    showTyping();

    try {
      const res = await fetch("/demo/api/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId, message }),
      });
      const data = await res.json();
      hideTyping();
      addBubble(data.reply || "(sin respuesta)", "bot");
    } catch (err) {
      hideTyping();
      addBubble("No se pudo conectar con el bot. Intenta de nuevo.", "bot");
    } finally {
      status.textContent = "en línea";
      status.classList.remove("typing");
      sendBtn.disabled = false;
      input.focus();
    }
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });

  addBubble("¡Hola! 👋 Bienvenido/a a ${escapeJs(COURIER_NAME)}. ¿En qué puedo ayudarte? Puedo darte seguimiento a un paquete o resolver dudas sobre tarifas, cobertura y más.", "bot");
})();
</script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
