import { PackageStatus } from "@prisma/client";
import { db } from "../lib/db";
import { NEXT_STATUS, setPackageStatus } from "./packages";
import { sendPendingSatisfactionSurveys } from "./npsSurvey";
import { Sentry } from "../lib/sentry";

const SWEEP_INTERVAL_MS = 20 * 60 * 1000; // 20 minutos

// Cuanto tiempo debe llevar un paquete sin cambios antes de que este job lo
// considere candidato a avanzar -- evita que un paquete recien creado (o
// recien tocado a mano desde el panel) salte de estado a los pocos minutos.
const MIN_AGE_BEFORE_ADVANCE_MS = 30 * 60 * 1000;

// Por cada barrido, que fraccion de los paquetes elegibles avanza.
const ADVANCE_PROBABILITY = 0.5;
// Probabilidad de que, en vez de avanzar normalmente, el paquete caiga en una
// incidencia (retraso, direccion incorrecta, etc.) -- le da variedad realista
// a la demo sin que todo sea siempre un camino perfecto.
const EXCEPTION_PROBABILITY = 0.04;

const LOCATIONS_BY_STATUS: Partial<Record<PackageStatus, string[]>> = {
  PICKED_UP: ["Centro de recolección", "Bodega de origen"],
  IN_TRANSIT: ["Centro de distribución", "En ruta hacia el centro de clasificación", "Centro de clasificación"],
  OUT_FOR_DELIVERY: ["En camión de reparto", "Cerca del destino"],
};

function pickLocation(status: PackageStatus, destinationCity: string | null): string | null {
  if (status === "DELIVERED") return destinationCity;
  const options = LOCATIONS_BY_STATUS[status];
  if (!options || options.length === 0) return destinationCity;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Simula la sincronizacion periodica con la plataforma de tracking global
 * (ver src/lib/trackingProvider.ts): hace avanzar los paquetes elegibles a su
 * siguiente estado logico, agregando el evento correspondiente. El staff
 * tambien puede forzar un avance manual desde el panel (/panel, boton
 * "Avanzar") para una demo en vivo sin depender de este barrido.
 */
export async function sweepOnce(): Promise<void> {
  const cutoff = new Date(Date.now() - MIN_AGE_BEFORE_ADVANCE_MS);
  const eligibleStatuses = Object.keys(NEXT_STATUS) as PackageStatus[];

  const candidates = await db.package.findMany({
    where: { status: { in: eligibleStatuses }, updatedAt: { lte: cutoff } },
  });

  for (const pkg of candidates) {
    if (Math.random() > ADVANCE_PROBABILITY) continue;

    const toException = Math.random() < EXCEPTION_PROBABILITY;
    const nextStatus: PackageStatus = toException ? PackageStatus.EXCEPTION : NEXT_STATUS[pkg.status]!;

    await setPackageStatus(pkg.id, nextStatus, {
      location: toException ? pkg.destinationCity : pickLocation(nextStatus, pkg.destinationCity),
      note: toException ? "Retraso detectado en el recorrido -- se está revisando." : null,
    });
  }

  await sendPendingSatisfactionSurveys();
}

/** Arranca el barrido periodico: avance simulado de paquetes + encuestas NPS pendientes. */
export function startPackageProgressionScheduler(): void {
  setInterval(() => {
    sweepOnce().catch((err) => {
      console.error("Error en el barrido de paquetes:", err);
      Sentry.captureException(err);
    });
  }, SWEEP_INTERVAL_MS);
}
