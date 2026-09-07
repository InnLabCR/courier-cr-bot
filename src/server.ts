import "dotenv/config";
import { initSentry, Sentry } from "./lib/sentry";

initSentry();

import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { whatsappRouter } from "./routes/whatsapp";
import { adminRouter } from "./routes/admin";
import { panelRouter } from "./routes/panel";
import { webchatRouter } from "./routes/webchat";
import { startInactivitySweeper } from "./services/conversationScheduler";
import { startPackageProgressionScheduler } from "./services/packageProgressionScheduler";

const app = express();

// Railway pone exactamente un proxy delante de la app, que termina el TLS y
// reenvia por HTTP internamente -- sin esto, req.protocol siempre daria "http"
// y la validacion de la firma de Twilio fallaria. Se confia solo en ESE salto
// (no en "true"/todos), porque confiar en cualquier proxy permite falsificar
// la IP del cliente y romper el limite de intentos del login.
app.set("trust proxy", 1);

// CSP desactivada a proposito: el panel usa <style> y atributos onclick/onsubmit
// inline en vez de un bundler -- una CSP estricta por defecto los bloquearia.
// El resto de protecciones de helmet (X-Frame-Options, no-sniff, etc.) si aplican.
app.use(helmet({ contentSecurityPolicy: false }));

app.use(express.urlencoded({ extended: false })); // Twilio y los formularios del panel envian form-urlencoded
app.use(express.json());
app.use(cookieParser(process.env.ADMIN_API_KEY)); // misma clave se usa para firmar la cookie del panel

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    serverTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    serverLocalTime: new Date().toString(),
  });
});

app.use(whatsappRouter);
app.use(adminRouter);
app.use(panelRouter);
app.use(webchatRouter);

Sentry.setupExpressErrorHandler(app);

// Handler final: cualquier error no manejado ya fue reportado a Sentry por el
// handler anterior -- aqui solo se responde algo generico, sin filtrar
// detalles internos al navegador.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Error no manejado:", err);
  res.status(500).send("Ocurrio un error inesperado. El equipo ya fue notificado.");
});

startInactivitySweeper();
startPackageProgressionScheduler();

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
