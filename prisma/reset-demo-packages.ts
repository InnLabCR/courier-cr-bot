import "dotenv/config";
import { PrismaClient, PackageStatus, SurveyStatus } from "@prisma/client";

// Devuelve los paquetes de ejemplo a un estado variado y fresco (fechas
// relativas a "ahora"), sin tocar tarifas, informacion general ni
// conversaciones. Pensado para correrse antes de cada demo:
//   npm run db:reset-demo
// Es idempotente: actualiza por numero de guia y reemplaza solo el historial
// de esos paquetes.

const db = new PrismaClient();

const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => hoursAgo(d * 24);

interface DemoEvent {
  status: PackageStatus;
  location?: string;
  note?: string;
  occurredAt: Date;
}

interface DemoPackage {
  trackingNumber: string;
  description: string;
  originCity: string;
  destinationCity: string;
  carrier: string;
  weightKg: number;
  estimatedDelivery: Date;
  recipientName: string;
  recipientPhone: string;
  status: PackageStatus;
  events: DemoEvent[];
  survey?: { score: number; comment: string };
}

const S = PackageStatus;

const PACKAGES: DemoPackage[] = [
  {
    trackingNumber: "CR100001CR",
    description: "Caja mediana - repuestos electrónicos",
    originCity: "San José",
    destinationCity: "Liberia",
    carrier: "Courier CR Express",
    weightKg: 2.4,
    estimatedDelivery: daysAgo(1),
    recipientName: "Marco Jiménez",
    recipientPhone: "whatsapp:+50688001001",
    status: S.DELIVERED,
    events: [
      { status: S.PENDING, location: "San José", occurredAt: daysAgo(5) },
      { status: S.PICKED_UP, location: "Centro de recolección San José", occurredAt: daysAgo(5) },
      { status: S.IN_TRANSIT, location: "Centro de distribución San José", occurredAt: daysAgo(4) },
      { status: S.OUT_FOR_DELIVERY, location: "En camión de reparto", occurredAt: daysAgo(1.1) },
      { status: S.DELIVERED, location: "Liberia", note: "Recibido por el destinatario", occurredAt: daysAgo(1) },
    ],
    survey: { score: 9, comment: "Llegó rápido, buen servicio" },
  },
  {
    trackingNumber: "CR100002CR",
    description: "Sobre de documentos",
    originCity: "Heredia",
    destinationCity: "Puntarenas",
    carrier: "Courier CR Express",
    weightKg: 0.3,
    estimatedDelivery: daysAgo(-1),
    recipientName: "Ana Rodríguez",
    recipientPhone: "whatsapp:+50688001002",
    status: S.IN_TRANSIT,
    events: [
      { status: S.PENDING, location: "Heredia", occurredAt: hoursAgo(30) },
      { status: S.PICKED_UP, location: "Centro de recolección Heredia", occurredAt: hoursAgo(28) },
      { status: S.IN_TRANSIT, location: "Centro de distribución San José", occurredAt: hoursAgo(10) },
    ],
  },
  {
    trackingNumber: "CR100003CR",
    description: "Paquete pequeño - accesorios de celular",
    originCity: "San José",
    destinationCity: "Cartago",
    carrier: "Courier CR Express",
    weightKg: 0.8,
    estimatedDelivery: new Date(),
    recipientName: "Luis Vargas",
    recipientPhone: "whatsapp:+50688001003",
    status: S.OUT_FOR_DELIVERY,
    events: [
      { status: S.PENDING, location: "San José", occurredAt: hoursAgo(20) },
      { status: S.PICKED_UP, location: "Centro de recolección San José", occurredAt: hoursAgo(18) },
      { status: S.IN_TRANSIT, location: "Centro de distribución San José", occurredAt: hoursAgo(12) },
      { status: S.OUT_FOR_DELIVERY, location: "En camión de reparto", occurredAt: hoursAgo(1) },
    ],
  },
  {
    trackingNumber: "US900004CR",
    description: "Paquete internacional - ropa",
    originCity: "Miami, USA",
    destinationCity: "San José",
    carrier: "Courier CR Express Internacional",
    weightKg: 3.1,
    estimatedDelivery: daysAgo(-4),
    recipientName: "Karla Solano",
    recipientPhone: "whatsapp:+50688001004",
    status: S.CUSTOMS,
    events: [
      { status: S.PENDING, location: "Miami, USA", occurredAt: daysAgo(6) },
      { status: S.PICKED_UP, location: "Bodega Miami", occurredAt: daysAgo(6) },
      { status: S.IN_TRANSIT, location: "Vuelo internacional", occurredAt: daysAgo(4) },
      { status: S.CUSTOMS, location: "Aduana Juan Santamaría", note: "En proceso de nacionalización", occurredAt: daysAgo(2) },
    ],
  },
  {
    trackingNumber: "CR100005CR",
    description: "Caja grande - electrodomésticos",
    originCity: "Alajuela",
    destinationCity: "Limón",
    carrier: "Courier CR Express",
    weightKg: 6.5,
    estimatedDelivery: daysAgo(-3),
    recipientName: "Roberto Chaves",
    recipientPhone: "whatsapp:+50688001005",
    status: S.PENDING,
    events: [
      { status: S.PENDING, location: "Alajuela", note: "Paquete registrado en el sistema.", occurredAt: hoursAgo(5) },
    ],
  },
  {
    trackingNumber: "CR100006CR",
    description: "Sobre - contrato firmado",
    originCity: "San José",
    destinationCity: "Guápiles",
    carrier: "Courier CR Express",
    weightKg: 0.2,
    estimatedDelivery: daysAgo(1),
    recipientName: "Diana Mora",
    recipientPhone: "whatsapp:+50688001006",
    status: S.EXCEPTION,
    events: [
      { status: S.PENDING, location: "San José", occurredAt: daysAgo(5) },
      { status: S.PICKED_UP, location: "Centro de recolección San José", occurredAt: daysAgo(5) },
      { status: S.IN_TRANSIT, location: "Centro de distribución San José", occurredAt: daysAgo(3) },
      { status: S.EXCEPTION, location: "Guápiles", note: "Dirección incompleta -- se está contactando al destinatario.", occurredAt: daysAgo(1) },
    ],
  },
  {
    trackingNumber: "CR100007CR",
    description: "Paquete mediano - libros",
    originCity: "San José",
    destinationCity: "San José",
    carrier: "Courier CR Express",
    weightKg: 1.5,
    estimatedDelivery: hoursAgo(10),
    recipientName: "Pablo Araya",
    recipientPhone: "whatsapp:+50688001007",
    status: S.DELIVERED,
    events: [
      { status: S.PENDING, location: "San José", occurredAt: daysAgo(2) },
      { status: S.PICKED_UP, location: "Centro de recolección San José", occurredAt: daysAgo(2) },
      { status: S.IN_TRANSIT, location: "Centro de distribución San José", occurredAt: hoursAgo(20) },
      { status: S.OUT_FOR_DELIVERY, location: "En camión de reparto", occurredAt: hoursAgo(11) },
      { status: S.DELIVERED, location: "San José", note: "Recibido por el destinatario", occurredAt: hoursAgo(10) },
    ],
  },
  {
    trackingNumber: "CR100008CR",
    description: "Caja pequeña - cosméticos",
    originCity: "Cartago",
    destinationCity: "Heredia",
    carrier: "Courier CR Express",
    weightKg: 1.1,
    estimatedDelivery: daysAgo(-2),
    recipientName: "Sofía Brenes",
    recipientPhone: "whatsapp:+50688001008",
    status: S.PICKED_UP,
    events: [
      { status: S.PENDING, location: "Cartago", occurredAt: hoursAgo(8) },
      { status: S.PICKED_UP, location: "Centro de recolección Cartago", occurredAt: hoursAgo(3) },
    ],
  },
];

async function main() {
  for (const p of PACKAGES) {
    const data = {
      description: p.description,
      originCity: p.originCity,
      destinationCity: p.destinationCity,
      carrier: p.carrier,
      weightKg: p.weightKg,
      estimatedDelivery: p.estimatedDelivery,
      recipientName: p.recipientName,
      recipientPhone: p.recipientPhone,
      status: p.status,
    };
    const pkg = await db.package.upsert({
      where: { trackingNumber: p.trackingNumber },
      update: data,
      create: { trackingNumber: p.trackingNumber, ...data },
    });

    await db.trackingEvent.deleteMany({ where: { packageId: pkg.id } });
    await db.trackingEvent.createMany({
      data: p.events.map((e) => ({
        packageId: pkg.id,
        status: e.status,
        location: e.location ?? null,
        note: e.note ?? null,
        occurredAt: e.occurredAt,
      })),
    });

    await db.satisfactionSurvey.deleteMany({ where: { packageId: pkg.id } });
    if (p.survey) {
      await db.satisfactionSurvey.create({
        data: {
          packageId: pkg.id,
          phone: p.recipientPhone,
          status: SurveyStatus.RESPONDED,
          sentAt: hoursAgo(20),
          respondedAt: hoursAgo(19),
          score: p.survey.score,
          comment: p.survey.comment,
        },
      });
    }
  }

  const resumen = await db.package.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("Paquetes de demo reseteados:", Object.fromEntries(resumen.map((r) => [r.status, r._count._all])));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
