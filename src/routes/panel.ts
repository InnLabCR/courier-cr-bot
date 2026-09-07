import { Router } from "express";
import rateLimit from "express-rate-limit";
import { PackageStatus } from "@prisma/client";
import { db } from "../lib/db";
import {
  listPackages,
  getPackageWithEvents,
  createPackage,
  setPackageStatus,
  advancePackage,
  NEXT_STATUS,
  STATUS_LABELS,
} from "../services/packages";
import { renderLayout, renderLogin, escapeHtml } from "../lib/panelLayout";

export const panelRouter = Router();

const COOKIE_NAME = "panel_session";
const COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 horas

function getPanelPassword(): string {
  const password = process.env.ADMIN_API_KEY;
  if (!password) {
    throw new Error("Falta ADMIN_API_KEY en el entorno (se usa como contraseña del panel).");
  }
  return password;
}

// Solo cuenta intentos fallidos (skipSuccessfulRequests) -- un uso normal del
// panel nunca deberia toparse con el limite, solo alguien probando contraseñas.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res
      .status(429)
      .send(renderLogin({ error: "Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo." }));
  },
});

panelRouter.get("/panel/login", (req, res) => {
  res.send(renderLogin({}));
});

panelRouter.post("/panel/login", loginRateLimiter, (req, res) => {
  const password = (req.body?.password as string | undefined) ?? "";
  if (password && password === getPanelPassword()) {
    res.cookie(COOKIE_NAME, "ok", {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE_MS,
    });
    res.redirect("/panel");
    return;
  }
  res.status(401).send(renderLogin({ error: "Contraseña incorrecta." }));
});

panelRouter.post("/panel/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect("/panel/login");
});

// Se limita explicitamente a rutas bajo /panel -- sin el prefijo aqui, este
// middleware interceptaria cualquier peticion no reconocida por otras rutas.
panelRouter.use("/panel", (req, res, next) => {
  if (req.signedCookies?.[COOKIE_NAME] === "ok") {
    next();
    return;
  }
  res.redirect("/panel/login");
});

function statusPill(status: PackageStatus): string {
  return `<span class="pill ${status.toLowerCase()}">${escapeHtml(STATUS_LABELS[status])}</span>`;
}

const STATUS_OPTIONS = (Object.keys(STATUS_LABELS) as PackageStatus[])
  .map((s) => `<option value="${s}">${STATUS_LABELS[s]}</option>`)
  .join("");

// --- Vista "Paquetes": listado + alta + avance rapido de estado ---

panelRouter.get("/panel", async (req, res, next) => {
  try {
    const q = ((req.query.q as string | undefined) ?? "").trim();
    const packages = await listPackages(q);

    const rows = packages.length
      ? packages
          .map((p) => {
            const canAdvance = Boolean(NEXT_STATUS[p.status]);
            const updated = p.updatedAt.toLocaleString("es-CR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            const action = canAdvance
              ? `<form method="post" action="/panel/paquetes/${p.id}/avanzar" style="display:inline">
                  <button type="submit" class="small-btn ghost" style="padding:4px 10px;font-size:12px">Avanzar</button>
                </form>`
              : "—";
            return `<tr>
              <td><a href="/panel/paquetes/${p.id}" class="mono">${escapeHtml(p.trackingNumber)}</a></td>
              <td>${p.description ? escapeHtml(p.description) : "—"}${p.recipientName ? `<br><span style="color:var(--ink-faint);font-size:12.5px">${escapeHtml(p.recipientName)}</span>` : ""}</td>
              <td>${p.destinationCity ? escapeHtml(p.destinationCity) : "—"}</td>
              <td>${statusPill(p.status)}</td>
              <td class="mono" style="color:var(--ink-faint);font-size:12.5px">${updated}</td>
              <td>${action}</td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="empty">No se encontraron paquetes.</td></tr>`;

    const flash = (req.query.ok as string | undefined)
      ? `<div class="banner-ok">${
          req.query.ok === "creado" ? "Paquete agregado correctamente." : "Estado del paquete actualizado."
        }</div>`
      : "";

    const body = `
      <h1>Paquetes</h1>
      <p class="subtitle">Estado de todos los paquetes sincronizados con la plataforma de tracking.</p>
      ${flash}
      <form class="search-box" method="get" action="/panel">
        <input type="text" name="q" placeholder="Buscar por guía, contenido o destinatario..." value="${escapeHtml(q)}" />
      </form>
      <div class="card">
        <table>
          <thead><tr><th>Guía</th><th>Contenido</th><th>Destino</th><th>Estado</th><th>Actualizado</th><th>Acción</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="card add-card">
        <h3>Agregar paquete</h3>
        <p class="subtitle" style="margin-bottom:16px">Simula que el paquete llegó a la plataforma de tracking. En producción esto lo haría la sincronización automática.</p>
        <form method="post" action="/panel/paquetes" class="row-form">
          <input type="text" name="trackingNumber" placeholder="Número de guía" required />
          <input type="text" name="description" placeholder="Contenido (opcional)" />
          <input type="text" name="originCity" placeholder="Origen" />
          <input type="text" name="destinationCity" placeholder="Destino" />
          <input type="text" name="carrier" placeholder="Transportista" />
          <input type="date" name="estimatedDelivery" />
          <input type="text" name="recipientName" placeholder="Nombre destinatario" />
          <input type="text" name="recipientPhone" placeholder="WhatsApp destinatario (+506...)" />
          <button type="submit" class="small-btn">Agregar</button>
        </form>
      </div>
    `;

    res.send(renderLayout({ title: "Paquetes", activeKey: "paquetes", body }));
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/paquetes", async (req, res, next) => {
  try {
    const {
      trackingNumber,
      description,
      originCity,
      destinationCity,
      carrier,
      estimatedDelivery,
      recipientName,
      recipientPhone,
    } = req.body as Record<string, string | undefined>;

    if (!trackingNumber) {
      res.redirect("/panel");
      return;
    }

    await createPackage({
      trackingNumber,
      description: description || null,
      originCity: originCity || null,
      destinationCity: destinationCity || null,
      carrier: carrier || null,
      estimatedDelivery: estimatedDelivery ? new Date(`${estimatedDelivery}T00:00:00`) : null,
      recipientName: recipientName || null,
      recipientPhone: recipientPhone ? (recipientPhone.startsWith("whatsapp:") ? recipientPhone : `whatsapp:${recipientPhone}`) : null,
    });

    res.redirect("/panel?ok=creado");
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/paquetes/:id/avanzar", async (req, res, next) => {
  try {
    await advancePackage(req.params.id);
    res.redirect("/panel?ok=avanzado");
  } catch (err) {
    next(err);
  }
});

panelRouter.get("/panel/paquetes/:id", async (req, res, next) => {
  try {
    const pkg = await getPackageWithEvents(req.params.id);
    if (!pkg) {
      res.status(404).send(
        renderLayout({
          title: "Paquete no encontrado",
          activeKey: "paquetes",
          body: `<a class="back-link" href="/panel">&larr; Volver a paquetes</a><p class="empty">No se encontró ese paquete.</p>`,
        }),
      );
      return;
    }

    const events = pkg.events.slice().sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const timeline = events.length
      ? events
          .map((e) => {
            const when = e.occurredAt.toLocaleString("es-CR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            return `<div class="timeline-item">
              <span class="dot"></span>
              <span class="when mono">${when}</span>
              <div class="what">
                <div>${statusPill(e.status)}</div>
                ${e.location ? `<div class="loc">${escapeHtml(e.location)}</div>` : ""}
                ${e.note ? `<div class="note">${escapeHtml(e.note)}</div>` : ""}
              </div>
            </div>`;
          })
          .join("")
      : `<p class="empty">Sin movimientos registrados todavía.</p>`;

    const flash = (req.query.ok as string | undefined) ? `<div class="banner-ok">Estado actualizado.</div>` : "";

    const body = `
      <a class="back-link" href="/panel">&larr; Volver a paquetes</a>
      <h1 class="mono">${escapeHtml(pkg.trackingNumber)}</h1>
      <p class="subtitle">
        ${pkg.description ? escapeHtml(pkg.description) + " &middot; " : ""}
        ${pkg.originCity ? escapeHtml(pkg.originCity) : "?"} &rarr; ${pkg.destinationCity ? escapeHtml(pkg.destinationCity) : "?"}
        ${pkg.carrier ? ` &middot; ${escapeHtml(pkg.carrier)}` : ""}
        ${pkg.recipientName ? ` &middot; Destinatario: ${escapeHtml(pkg.recipientName)}` : ""}
      </p>
      ${flash}
      <div style="margin-bottom:20px">${statusPill(pkg.status)}</div>

      <div class="card" style="padding:20px 24px;margin-bottom:20px">
        <h3 style="margin-top:0">Forzar estado (control manual del staff)</h3>
        <p class="subtitle" style="margin-bottom:16px">Útil para demostraciones en vivo o para corregir un estado sin esperar la sincronización automática.</p>
        <form method="post" action="/panel/paquetes/${pkg.id}/estado" class="row-form">
          <select name="status" required>${STATUS_OPTIONS}</select>
          <input type="text" name="location" placeholder="Ubicación (opcional)" />
          <input type="text" name="note" placeholder="Nota (opcional)" style="width:220px" />
          <button type="submit" class="small-btn">Actualizar estado</button>
        </form>
      </div>

      <div class="card" style="padding:20px 24px">
        <h3 style="margin-top:0">Historial</h3>
        <div class="timeline">${timeline}</div>
      </div>
    `;

    res.send(renderLayout({ title: pkg.trackingNumber, activeKey: "paquetes", body }));
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/paquetes/:id/estado", async (req, res, next) => {
  try {
    const { status, location, note } = req.body as { status?: string; location?: string; note?: string };
    if (!status || !(status in STATUS_LABELS)) {
      res.redirect(`/panel/paquetes/${req.params.id}`);
      return;
    }

    await setPackageStatus(req.params.id, status as PackageStatus, {
      location: location || null,
      note: note || null,
    });

    res.redirect(`/panel/paquetes/${req.params.id}?ok=1`);
  } catch (err) {
    next(err);
  }
});

// --- Vista "Tarifas": precios y catalogo, editable desde el panel ---

function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function amountToCents(amount: string): number {
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

panelRouter.get("/panel/tarifas", async (req, res, next) => {
  try {
    const rates = await db.shippingRate.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });

    const rows = rates.length
      ? rates
          .map(
            (r) => `<tr class="${r.active ? "" : "inactive-row"}">
              <td>
                <form method="post" action="/panel/tarifas/${r.id}/editar" class="row-form">
                  <input type="text" name="name" value="${escapeHtml(r.name)}" required />
                  <input type="text" name="description" value="${r.description ? escapeHtml(r.description) : ""}" placeholder="Descripción" style="width:200px" />
                  <input type="number" name="price" step="0.01" min="0" value="${centsToAmount(r.priceCents)}" required />
                  <input type="text" name="currency" value="${escapeHtml(r.currency)}" style="width:56px" required />
                  <button type="submit" class="small-btn">Guardar</button>
                </form>
              </td>
              <td>
                <form method="post" action="/panel/tarifas/${r.id}/${r.active ? "desactivar" : "activar"}">
                  <button type="submit" class="small-btn ${r.active ? "ghost" : ""}">${r.active ? "Desactivar" : "Activar"}</button>
                </form>
              </td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="2" class="empty">No hay tarifas registradas todavía.</td></tr>`;

    const body = `
      <h1>Tarifas</h1>
      <p class="subtitle">Precios y servicios que usa el bot al responder consultas. Una tarifa "desactivada" deja de ofrecerse por WhatsApp.</p>
      <div class="card">
        <table>
          <thead><tr><th>Nombre / descripción / precio / moneda</th><th>Estado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="card add-card">
        <h3>Agregar tarifa nueva</h3>
        <form method="post" action="/panel/tarifas" class="row-form">
          <input type="text" name="name" placeholder="Nombre (ej. Envío nacional express)" required />
          <input type="text" name="description" placeholder="Descripción (opcional)" style="width:200px" />
          <input type="number" name="price" step="0.01" min="0" placeholder="Precio" required />
          <input type="text" name="currency" value="CRC" style="width:56px" required />
          <button type="submit" class="small-btn">Agregar</button>
        </form>
      </div>
    `;

    res.send(renderLayout({ title: "Tarifas", activeKey: "tarifas", body }));
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/tarifas", async (req, res, next) => {
  try {
    const { name, description, price, currency } = req.body as Record<string, string | undefined>;
    if (!name || !price || !currency) {
      res.redirect("/panel/tarifas");
      return;
    }

    await db.shippingRate.create({
      data: { name, description: description || null, priceCents: amountToCents(price), currency },
    });

    res.redirect("/panel/tarifas");
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/tarifas/:id/editar", async (req, res, next) => {
  try {
    const { name, description, price, currency } = req.body as Record<string, string | undefined>;
    if (!name || !price || !currency) {
      res.redirect("/panel/tarifas");
      return;
    }

    await db.shippingRate.update({
      where: { id: req.params.id },
      data: { name, description: description || null, priceCents: amountToCents(price), currency },
    });

    res.redirect("/panel/tarifas");
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/tarifas/:id/activar", async (req, res, next) => {
  try {
    await db.shippingRate.update({ where: { id: req.params.id }, data: { active: true } });
    res.redirect("/panel/tarifas");
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/tarifas/:id/desactivar", async (req, res, next) => {
  try {
    await db.shippingRate.update({ where: { id: req.params.id }, data: { active: false } });
    res.redirect("/panel/tarifas");
  } catch (err) {
    next(err);
  }
});

// --- Vista "Información": base de conocimiento (FAQ) editable desde el panel ---

panelRouter.get("/panel/informacion", async (req, res, next) => {
  try {
    const entries = await db.faqEntry.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] });

    const rows = entries.length
      ? entries
          .map(
            (e) => `<tr class="${e.active ? "" : "inactive-row"}">
              <td>
                <form method="post" action="/panel/informacion/${e.id}/editar" class="row-form">
                  <input type="text" name="topic" value="${escapeHtml(e.topic)}" placeholder="Tema" required style="width:160px" />
                  <textarea name="answer" rows="2" style="width:360px" required>${escapeHtml(e.answer)}</textarea>
                  <button type="submit" class="small-btn">Guardar</button>
                </form>
              </td>
              <td>
                <form method="post" action="/panel/informacion/${e.id}/${e.active ? "desactivar" : "activar"}">
                  <button type="submit" class="small-btn ${e.active ? "ghost" : ""}">${e.active ? "Desactivar" : "Activar"}</button>
                </form>
              </td>
            </tr>`,
          )
          .join("")
      : `<tr><td colspan="2" class="empty">No hay información registrada todavía.</td></tr>`;

    const body = `
      <h1>Información</h1>
      <p class="subtitle">Base de conocimiento que usa el bot para responder preguntas frecuentes (horarios, cobertura, cómo enviar un paquete, reclamos, etc). Una entrada "desactivada" deja de usarse.</p>
      <div class="card">
        <table>
          <thead><tr><th>Tema / respuesta</th><th>Estado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="card add-card">
        <h3>Agregar información nueva</h3>
        <form method="post" action="/panel/informacion" class="row-form">
          <input type="text" name="topic" placeholder="Tema (ej. Horario de atención)" required style="width:160px" />
          <textarea name="answer" rows="2" style="width:360px" placeholder="Respuesta" required></textarea>
          <button type="submit" class="small-btn">Agregar</button>
        </form>
      </div>
    `;

    res.send(renderLayout({ title: "Información", activeKey: "informacion", body }));
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/informacion", async (req, res, next) => {
  try {
    const { topic, answer } = req.body as Record<string, string | undefined>;
    if (!topic || !answer) {
      res.redirect("/panel/informacion");
      return;
    }
    await db.faqEntry.create({ data: { topic, answer } });
    res.redirect("/panel/informacion");
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/informacion/:id/editar", async (req, res, next) => {
  try {
    const { topic, answer } = req.body as Record<string, string | undefined>;
    if (!topic || !answer) {
      res.redirect("/panel/informacion");
      return;
    }
    await db.faqEntry.update({ where: { id: req.params.id }, data: { topic, answer } });
    res.redirect("/panel/informacion");
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/informacion/:id/activar", async (req, res, next) => {
  try {
    await db.faqEntry.update({ where: { id: req.params.id }, data: { active: true } });
    res.redirect("/panel/informacion");
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/informacion/:id/desactivar", async (req, res, next) => {
  try {
    await db.faqEntry.update({ where: { id: req.params.id }, data: { active: false } });
    res.redirect("/panel/informacion");
  } catch (err) {
    next(err);
  }
});

// --- Vista "Conversaciones": transcripciones + escalaciones a humano ---

// El modelo Escalation no guarda la sesion a la que pertenece (solo telefono
// y fecha), asi que se vincula por telefono buscando la sesion que estaba
// activa en ese momento.
function findSessionForEscalation<T extends { phone: string; startedAt: Date; closedAt: Date | null }>(
  sessions: T[],
  escalation: { phone: string; createdAt: Date },
): T | undefined {
  return sessions.find(
    (s) => s.phone === escalation.phone && s.startedAt <= escalation.createdAt && escalation.createdAt <= (s.closedAt ?? new Date()),
  );
}

panelRouter.get("/panel/conversaciones", async (req, res, next) => {
  try {
    const soloEscaladas = req.query.escaladas === "1";

    const [sessions, escalations] = await Promise.all([
      db.conversationSession.findMany({
        orderBy: { lastMessageAt: "desc" },
        take: 150,
        include: { _count: { select: { messages: true } } },
      }),
      db.escalation.findMany({ orderBy: { createdAt: "desc" } }),
    ]);

    const escalationsBySession = new Map<string, typeof escalations>();
    for (const esc of escalations) {
      const session = findSessionForEscalation(sessions, esc);
      if (!session) continue;
      if (!escalationsBySession.has(session.id)) escalationsBySession.set(session.id, []);
      escalationsBySession.get(session.id)!.push(esc);
    }

    const visibleSessions = soloEscaladas ? sessions.filter((s) => escalationsBySession.has(s.id)) : sessions;

    const rows = visibleSessions.length
      ? visibleSessions
          .map((s) => {
            const escs = escalationsBySession.get(s.id) ?? [];
            const hasOpenEscalation = escs.some((e) => e.status === "OPEN");
            const badge = escs.length
              ? `<span class="pill ${hasOpenEscalation ? "cancelled" : "completed"}">${hasOpenEscalation ? "Escalada" : "Resuelta"}</span>`
              : "—";
            const estado =
              s.status === "OPEN" ? `<span class="pill next">Abierta</span>` : `<span class="pill scheduled">Cerrada</span>`;
            const when = s.startedAt.toLocaleString("es-CR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            return `<tr>
              <td class="mono">${escapeHtml(s.phone.replace("whatsapp:", ""))}</td>
              <td class="mono">${when}</td>
              <td>${estado}</td>
              <td>${s._count.messages}</td>
              <td>${badge}</td>
              <td><a href="/panel/conversaciones/${s.id}">Ver transcripción</a></td>
            </tr>`;
          })
          .join("")
      : `<tr><td colspan="6" class="empty">No hay conversaciones${soloEscaladas ? " escaladas" : ""} todavía.</td></tr>`;

    const body = `
      <h1>Conversaciones</h1>
      <p class="subtitle">Historial de sesiones con el bot. Las marcadas "Escalada" pasaron a una persona del equipo — revisa el motivo para ver si conviene ampliar lo que el bot sabe responder.</p>
      <div class="filter-tabs">
        <a href="/panel/conversaciones" class="${!soloEscaladas ? "active" : ""}">Todas</a>
        <a href="/panel/conversaciones?escaladas=1" class="${soloEscaladas ? "active" : ""}">Solo escaladas</a>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>Teléfono</th><th>Inicio</th><th>Estado</th><th>Mensajes</th><th>Escalación</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    res.send(renderLayout({ title: "Conversaciones", activeKey: "conversaciones", body }));
  } catch (err) {
    next(err);
  }
});

panelRouter.get("/panel/conversaciones/:id", async (req, res, next) => {
  try {
    const session = await db.conversationSession.findUnique({
      where: { id: req.params.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!session) {
      res.status(404).send(
        renderLayout({
          title: "Conversación no encontrada",
          activeKey: "conversaciones",
          body: `<a class="back-link" href="/panel/conversaciones">&larr; Volver a conversaciones</a><p class="empty">No se encontró esa conversación.</p>`,
        }),
      );
      return;
    }

    const escalations = await db.escalation.findMany({
      where: {
        phone: session.phone,
        createdAt: { gte: session.startedAt, lte: session.closedAt ?? new Date() },
      },
      orderBy: { createdAt: "asc" },
    });

    const escalationBlocks = escalations
      .map(
        (e) => `
      <div class="escalation-note">
        <span class="label">Escalada a un humano${e.status === "RESOLVED" ? " · Resuelta" : ""}</span>
        <p>${escapeHtml(e.reason)}</p>
        ${
          e.status === "OPEN"
            ? `<form method="post" action="/panel/escalaciones/${e.id}/resolver">
                <button type="submit" class="link-btn" style="color:var(--accent)">Marcar como resuelta</button>
              </form>`
            : ""
        }
      </div>`,
      )
      .join("");

    const messageBlocks = session.messages.length
      ? session.messages
          .map((m) => {
            const isUser = m.role === "USER";
            const time = m.createdAt.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
            return `<div class="msg ${isUser ? "msg-user" : "msg-bot"}">
              <div class="msg-bubble">${escapeHtml(m.content)}</div>
              <div class="msg-meta mono">${isUser ? "Cliente" : "Bot"} · ${time}</div>
            </div>`;
          })
          .join("")
      : `<p class="empty">Sin mensajes registrados en esta sesión.</p>`;

    const body = `
      <a class="back-link" href="/panel/conversaciones">&larr; Volver a conversaciones</a>
      <h1>${escapeHtml(session.phone.replace("whatsapp:", ""))}</h1>
      <p class="subtitle">
        ${session.startedAt.toLocaleString("es-CR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        &middot; ${session.status === "OPEN" ? "Conversación abierta" : "Conversación cerrada"}
      </p>
      ${escalationBlocks}
      <div class="transcript">${messageBlocks}</div>
    `;

    res.send(renderLayout({ title: "Conversación", activeKey: "conversaciones", body }));
  } catch (err) {
    next(err);
  }
});

panelRouter.post("/panel/escalaciones/:id/resolver", async (req, res, next) => {
  try {
    const escalation = await db.escalation.update({
      where: { id: req.params.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    const session = await db.conversationSession.findFirst({
      where: { phone: escalation.phone, startedAt: { lte: escalation.createdAt } },
      orderBy: { startedAt: "desc" },
    });

    res.redirect(session ? `/panel/conversaciones/${session.id}` : "/panel/conversaciones");
  } catch (err) {
    next(err);
  }
});

// --- Vista "Estadisticas": metricas agregadas del piloto ---

panelRouter.get("/panel/estadisticas", async (req, res, next) => {
  try {
    const [
      totalPaquetes,
      entregados,
      enCurso,
      incidencias,
      encuestasRespondidas,
      escalacionesAbiertas,
      escalacionesTotal,
      porEstadoRaw,
    ] = await Promise.all([
      db.package.count(),
      db.package.count({ where: { status: "DELIVERED" } }),
      db.package.count({ where: { status: { in: ["PICKED_UP", "IN_TRANSIT", "CUSTOMS", "OUT_FOR_DELIVERY"] } } }),
      db.package.count({ where: { status: "EXCEPTION" } }),
      db.satisfactionSurvey.findMany({ where: { status: "RESPONDED" }, select: { score: true } }),
      db.escalation.count({ where: { status: "OPEN" } }),
      db.escalation.count(),
      db.package.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

    const tasaIncidencias = totalPaquetes > 0 ? Math.round((incidencias / totalPaquetes) * 100) : 0;
    const npsPromedio = encuestasRespondidas.length
      ? (encuestasRespondidas.reduce((sum, e) => sum + (e.score ?? 0), 0) / encuestasRespondidas.length).toFixed(1)
      : "—";

    const porEstado = new Map(porEstadoRaw.map((r) => [r.status, r._count._all]));
    const maxEstado = Math.max(1, ...Array.from(porEstado.values()));
    const estadoBars = (Object.keys(STATUS_LABELS) as PackageStatus[])
      .map((status) => {
        const count = porEstado.get(status) ?? 0;
        const pct = Math.round((count / maxEstado) * 100);
        return `<div class="bar-row">
          <span class="bar-label">${STATUS_LABELS[status]}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
          <span class="bar-count">${count}</span>
        </div>`;
      })
      .join("");

    const body = `
      <h1>Estadísticas</h1>
      <p class="subtitle">Panorama general del piloto, desde que se empezó a usar el bot.</p>

      <div class="stat-grid">
        <div class="stat-tile">
          <div class="stat-label">Paquetes totales</div>
          <div class="stat-value mono">${totalPaquetes}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">Entregados</div>
          <div class="stat-value mono">${entregados}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">En curso</div>
          <div class="stat-value mono">${enCurso}</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">Tasa de incidencias</div>
          <div class="stat-value mono">${tasaIncidencias}%</div>
          <div class="stat-sub">${incidencias} de ${totalPaquetes} paquetes</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">NPS promedio</div>
          <div class="stat-value mono">${npsPromedio}</div>
          <div class="stat-sub">${encuestasRespondidas.length} encuestas respondidas</div>
        </div>
        <div class="stat-tile">
          <div class="stat-label">Escalaciones abiertas</div>
          <div class="stat-value mono">${escalacionesAbiertas}</div>
          <div class="stat-sub">${escalacionesTotal} en total</div>
        </div>
      </div>

      <div class="card" style="padding:20px 24px">
        <h3 style="margin-top:0">Paquetes por estado</h3>
        ${estadoBars}
      </div>
    `;

    res.send(renderLayout({ title: "Estadísticas", activeKey: "estadisticas", body }));
  } catch (err) {
    next(err);
  }
});
