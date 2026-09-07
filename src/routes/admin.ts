import { Router } from "express";
import { db } from "../lib/db";

export const adminRouter = Router();

// Se limita explicitamente a rutas bajo /admin -- sin el prefijo aqui, este
// middleware interceptaba TODAS las peticiones de la app (incluido /panel).
adminRouter.use("/admin", (req, res, next) => {
  const key = req.header("x-admin-key");
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
});

/**
 * Lista paquetes (filtros opcionales). Pensado para integraciones futuras
 * (ej. que la plataforma de tracking real empuje datos, o que otro sistema
 * interno consulte el estado) sin tener que pasar por el panel web.
 */
adminRouter.get("/admin/packages", async (req, res) => {
  const { status, q } = req.query as { status?: string; q?: string };
  const packages = await db.package.findMany({
    where: {
      ...(status ? { status: status as any } : {}),
      ...(q
        ? {
            OR: [
              { trackingNumber: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { events: { orderBy: { occurredAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
  res.json(packages);
});

adminRouter.get("/admin/stats", async (_req, res) => {
  const [total, delivered, inTransit, exceptions, escalationsOpen] = await Promise.all([
    db.package.count(),
    db.package.count({ where: { status: "DELIVERED" } }),
    db.package.count({ where: { status: { in: ["PICKED_UP", "IN_TRANSIT", "CUSTOMS", "OUT_FOR_DELIVERY"] } } }),
    db.package.count({ where: { status: "EXCEPTION" } }),
    db.escalation.count({ where: { status: "OPEN" } }),
  ]);
  res.json({ total, delivered, inTransit, exceptions, escalationsOpen });
});
