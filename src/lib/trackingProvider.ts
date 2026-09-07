import { Package, PackageStatus, TrackingEvent } from "@prisma/client";
import { db } from "./db";

export interface PackageSnapshot {
  trackingNumber: string;
  status: PackageStatus;
  description: string | null;
  originCity: string | null;
  destinationCity: string | null;
  carrier: string | null;
  estimatedDelivery: string | null; // ISO
  events: { status: PackageStatus; location: string | null; note: string | null; occurredAt: string }[];
}

/**
 * Contrato minimo que necesita el bot para consultar el estado de un
 * paquete. El dia que el cliente confirme cual plataforma de tracking usa de
 * verdad, se implementa esta misma interfaz llamando su API (ej.
 * RealCarrierTrackingProvider) y se cambia SOLO getTrackingProvider() --
 * las tools de Claude y las rutas no cambian nada.
 */
export interface TrackingProvider {
  getStatus(trackingNumber: string): Promise<PackageSnapshot | null>;
}

function toSnapshot(pkg: Package & { events: TrackingEvent[] }): PackageSnapshot {
  return {
    trackingNumber: pkg.trackingNumber,
    status: pkg.status,
    description: pkg.description,
    originCity: pkg.originCity,
    destinationCity: pkg.destinationCity,
    carrier: pkg.carrier,
    estimatedDelivery: pkg.estimatedDelivery ? pkg.estimatedDelivery.toISOString() : null,
    events: pkg.events
      .slice()
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map((e) => ({
        status: e.status,
        location: e.location,
        note: e.note,
        occurredAt: e.occurredAt.toISOString(),
      })),
  };
}

/**
 * Simula la "plataforma de tracking global" ficticia pedida por el cliente:
 * lee de nuestra propia base de datos (Package + TrackingEvent), que un job
 * de fondo (packageProgressionScheduler) va avanzando con el tiempo para que
 * la demo se sienta como una sincronizacion real.
 */
export class MockTrackingProvider implements TrackingProvider {
  async getStatus(trackingNumber: string): Promise<PackageSnapshot | null> {
    const pkg = await db.package.findUnique({
      where: { trackingNumber: trackingNumber.trim().toUpperCase() },
      include: { events: true },
    });
    if (!pkg) return null;
    return toSnapshot(pkg);
  }
}

let provider: TrackingProvider | null = null;

export function getTrackingProvider(): TrackingProvider {
  if (!provider) provider = new MockTrackingProvider();
  return provider;
}
