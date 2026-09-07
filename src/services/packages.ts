import { Package, PackageStatus, TrackingEvent } from "@prisma/client";
import { db } from "../lib/db";

export const STATUS_LABELS: Record<PackageStatus, string> = {
  PENDING: "Pendiente de recolección",
  PICKED_UP: "Recolectado",
  IN_TRANSIT: "En tránsito",
  CUSTOMS: "En aduana",
  OUT_FOR_DELIVERY: "En reparto",
  DELIVERED: "Entregado",
  EXCEPTION: "Incidencia",
};

// Progresion "normal" que sigue un paquete. Usada tanto por el job automatico
// (packageProgressionScheduler) como por el boton "Avanzar" del panel -- un
// estado sin siguiente definido (DELIVERED, EXCEPTION) es terminal y requiere
// intervencion manual del staff (ej. resolver la incidencia a mano).
export const NEXT_STATUS: Partial<Record<PackageStatus, PackageStatus>> = {
  PENDING: "PICKED_UP",
  PICKED_UP: "IN_TRANSIT",
  CUSTOMS: "IN_TRANSIT",
  IN_TRANSIT: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};

function normalizeTrackingNumber(trackingNumber: string): string {
  return trackingNumber.trim().toUpperCase();
}

export async function listPackages(query?: string): Promise<Package[]> {
  const q = query?.trim();
  return db.package.findMany({
    where: q
      ? {
          OR: [
            { trackingNumber: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { recipientName: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function getPackageWithEvents(
  id: string,
): Promise<(Package & { events: TrackingEvent[] }) | null> {
  return db.package.findUnique({ where: { id }, include: { events: true } });
}

export interface CreatePackageInput {
  trackingNumber: string;
  description?: string | null;
  originCity?: string | null;
  destinationCity?: string | null;
  carrier?: string | null;
  weightKg?: number | null;
  estimatedDelivery?: Date | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
}

/**
 * Da de alta un paquete nuevo -- en producción esto lo haría la sincronización
 * con la plataforma de tracking real; hoy lo hace el staff desde el panel
 * para simular que el paquete "llegó" al sistema.
 */
export async function createPackage(input: CreatePackageInput): Promise<Package> {
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
  return db.$transaction(async (tx) => {
    const pkg = await tx.package.create({
      data: {
        trackingNumber,
        description: input.description ?? null,
        originCity: input.originCity ?? null,
        destinationCity: input.destinationCity ?? null,
        carrier: input.carrier ?? null,
        weightKg: input.weightKg ?? null,
        estimatedDelivery: input.estimatedDelivery ?? null,
        recipientName: input.recipientName ?? null,
        recipientPhone: input.recipientPhone ?? null,
        status: PackageStatus.PENDING,
      },
    });
    await tx.trackingEvent.create({
      data: {
        packageId: pkg.id,
        status: PackageStatus.PENDING,
        location: input.originCity ?? null,
        note: "Paquete registrado en el sistema.",
      },
    });
    return pkg;
  });
}

export async function setPackageStatus(
  packageId: string,
  status: PackageStatus,
  opts?: { location?: string | null; note?: string | null },
): Promise<Package> {
  return db.$transaction(async (tx) => {
    const pkg = await tx.package.update({ where: { id: packageId }, data: { status } });
    await tx.trackingEvent.create({
      data: { packageId, status, location: opts?.location ?? null, note: opts?.note ?? null },
    });
    return pkg;
  });
}

/** Avanza un paquete a su siguiente estado logico. No hace nada si ya esta en un estado terminal. */
export async function advancePackage(packageId: string): Promise<Package | null> {
  const pkg = await db.package.findUnique({ where: { id: packageId } });
  if (!pkg) return null;
  const next = NEXT_STATUS[pkg.status];
  if (!next) return pkg;
  return setPackageStatus(packageId, next, { location: pkg.destinationCity });
}

export async function listActiveShippingRates() {
  return db.shippingRate.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

export async function listActiveFaqEntries() {
  return db.faqEntry.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
}
