import * as Sentry from "@sentry/node";

// Sin SENTRY_DSN configurado, Sentry.init no hace nada -- util para desarrollo
// local sin necesidad de una cuenta de Sentry.
export function initSentry(): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
