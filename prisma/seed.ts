import "dotenv/config";
import { PrismaClient, PackageStatus, SurveyStatus } from "@prisma/client";

const db = new PrismaClient();

function hoursAgo(h: number): Date {
  // h negativo da una fecha en el futuro -- util para "estimatedDelivery" que aun no pasa.
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function daysAgo(d: number): Date {
  return hoursAgo(d * 24);
}

interface SeedEvent {
  status: PackageStatus;
  location?: string;
  note?: string;
  occurredAt: Date;
}

interface SeedPackage {
  trackingNumber: string;
  description: string;
  originCity: string;
  destinationCity: string;
  carrier: string;
  weightKg?: number;
  estimatedDelivery?: Date;
  recipientName?: string;
  recipientPhone?: string;
  status: PackageStatus;
  events: SeedEvent[];
}

async function createPackageWithEvents(input: SeedPackage) {
  const pkg = await db.package.create({
    data: {
      trackingNumber: input.trackingNumber,
      description: input.description,
      originCity: input.originCity,
      destinationCity: input.destinationCity,
      carrier: input.carrier,
      weightKg: input.weightKg,
      estimatedDelivery: input.estimatedDelivery,
      recipientName: input.recipientName,
      recipientPhone: input.recipientPhone,
      status: input.status,
    },
  });
  await db.trackingEvent.createMany({
    data: input.events.map((e) => ({
      packageId: pkg.id,
      status: e.status,
      location: e.location ?? null,
      note: e.note ?? null,
      occurredAt: e.occurredAt,
    })),
  });
  return pkg;
}

async function main() {
  // 1. Entregado hace un dia, con encuesta NPS ya respondida.
  const delivered = await createPackageWithEvents({
    trackingNumber: "CR100001CR",
    description: "Caja mediana - repuestos electrónicos",
    originCity: "San José",
    destinationCity: "Liberia",
    carrier: "Courier CR Express",
    weightKg: 2.4,
    estimatedDelivery: daysAgo(1),
    recipientName: "Marco Jiménez",
    recipientPhone: "whatsapp:+50688001001",
    status: PackageStatus.DELIVERED,
    events: [
      { status: PackageStatus.PENDING, location: "San José", occurredAt: daysAgo(4) },
      { status: PackageStatus.PICKED_UP, location: "Centro de recolección San José", occurredAt: daysAgo(4) },
      { status: PackageStatus.IN_TRANSIT, location: "Centro de distribución San José", occurredAt: daysAgo(3) },
      { status: PackageStatus.OUT_FOR_DELIVERY, location: "En camión de reparto", occurredAt: daysAgo(1) },
      { status: PackageStatus.DELIVERED, location: "Liberia", note: "Recibido por el destinatario", occurredAt: daysAgo(1) },
    ],
  });
  await db.satisfactionSurvey.create({
    data: {
      packageId: delivered.id,
      phone: "whatsapp:+50688001001",
      status: SurveyStatus.RESPONDED,
      sentAt: hoursAgo(20),
      respondedAt: hoursAgo(19),
      score: 9,
      comment: "Llegó rápido, buen servicio",
    },
  });

  // 2. En tránsito.
  await createPackageWithEvents({
    trackingNumber: "CR100002CR",
    description: "Sobre de documentos",
    originCity: "Heredia",
    destinationCity: "Puntarenas",
    carrier: "Courier CR Express",
    weightKg: 0.3,
    estimatedDelivery: daysAgo(-1),
    recipientName: "Ana Rodríguez",
    recipientPhone: "whatsapp:+50688001002",
    status: PackageStatus.IN_TRANSIT,
    events: [
      { status: PackageStatus.PENDING, location: "Heredia", occurredAt: hoursAgo(30) },
      { status: PackageStatus.PICKED_UP, location: "Centro de recolección Heredia", occurredAt: hoursAgo(28) },
      { status: PackageStatus.IN_TRANSIT, location: "Centro de distribución San José", occurredAt: hoursAgo(10) },
    ],
  });

  // 3. En reparto, listo para hoy.
  await createPackageWithEvents({
    trackingNumber: "CR100003CR",
    description: "Paquete pequeño - accesorios de celular",
    originCity: "San José",
    destinationCity: "Cartago",
    carrier: "Courier CR Express",
    weightKg: 0.8,
    estimatedDelivery: new Date(),
    recipientName: "Luis Vargas",
    recipientPhone: "whatsapp:+50688001003",
    status: PackageStatus.OUT_FOR_DELIVERY,
    events: [
      { status: PackageStatus.PENDING, location: "San José", occurredAt: hoursAgo(20) },
      { status: PackageStatus.PICKED_UP, location: "Centro de recolección San José", occurredAt: hoursAgo(18) },
      { status: PackageStatus.IN_TRANSIT, location: "Centro de distribución San José", occurredAt: hoursAgo(12) },
      { status: PackageStatus.OUT_FOR_DELIVERY, location: "En camión de reparto", occurredAt: hoursAgo(1) },
    ],
  });

  // 4. Envío internacional retenido en aduana.
  await createPackageWithEvents({
    trackingNumber: "US900004CR",
    description: "Paquete internacional - ropa",
    originCity: "Miami, USA",
    destinationCity: "San José",
    carrier: "Courier CR Express Internacional",
    weightKg: 3.1,
    estimatedDelivery: daysAgo(-4),
    recipientName: "Karla Solano",
    recipientPhone: "whatsapp:+50688001004",
    status: PackageStatus.CUSTOMS,
    events: [
      { status: PackageStatus.PENDING, location: "Miami, USA", occurredAt: daysAgo(6) },
      { status: PackageStatus.PICKED_UP, location: "Bodega Miami", occurredAt: daysAgo(6) },
      { status: PackageStatus.IN_TRANSIT, location: "Vuelo internacional", occurredAt: daysAgo(4) },
      {
        status: PackageStatus.CUSTOMS,
        location: "Aduana Juan Santamaría",
        note: "En proceso de nacionalización",
        occurredAt: daysAgo(2),
      },
    ],
  });

  // 5. Recien registrado, pendiente de recoleccion.
  await createPackageWithEvents({
    trackingNumber: "CR100005CR",
    description: "Caja grande - electrodomésticos",
    originCity: "Alajuela",
    destinationCity: "Limón",
    carrier: "Courier CR Express",
    weightKg: 6.5,
    estimatedDelivery: daysAgo(-3),
    recipientName: "Roberto Chaves",
    recipientPhone: "whatsapp:+50688001005",
    status: PackageStatus.PENDING,
    events: [
      {
        status: PackageStatus.PENDING,
        location: "Alajuela",
        note: "Paquete registrado en el sistema.",
        occurredAt: hoursAgo(5),
      },
    ],
  });

  // 6. Con incidencia (retraso por direccion incompleta).
  await createPackageWithEvents({
    trackingNumber: "CR100006CR",
    description: "Sobre - contrato firmado",
    originCity: "San José",
    destinationCity: "Guápiles",
    carrier: "Courier CR Express",
    weightKg: 0.2,
    estimatedDelivery: daysAgo(1),
    recipientName: "Diana Mora",
    recipientPhone: "whatsapp:+50688001006",
    status: PackageStatus.EXCEPTION,
    events: [
      { status: PackageStatus.PENDING, location: "San José", occurredAt: daysAgo(5) },
      { status: PackageStatus.PICKED_UP, location: "Centro de recolección San José", occurredAt: daysAgo(5) },
      { status: PackageStatus.IN_TRANSIT, location: "Centro de distribución San José", occurredAt: daysAgo(3) },
      {
        status: PackageStatus.EXCEPTION,
        location: "Guápiles",
        note: "Dirección incompleta -- se está contactando al destinatario.",
        occurredAt: daysAgo(1),
      },
    ],
  });

  // 7. Entregado hace pocas horas, encuesta NPS aun sin responder (para probar el flujo completo).
  await createPackageWithEvents({
    trackingNumber: "CR100007CR",
    description: "Paquete mediano - libros",
    originCity: "San José",
    destinationCity: "San José",
    carrier: "Courier CR Express",
    weightKg: 1.5,
    estimatedDelivery: hoursAgo(10),
    recipientName: "Pablo Araya",
    recipientPhone: "whatsapp:+50688001007",
    status: PackageStatus.DELIVERED,
    events: [
      { status: PackageStatus.PENDING, location: "San José", occurredAt: daysAgo(2) },
      { status: PackageStatus.PICKED_UP, location: "Centro de recolección San José", occurredAt: daysAgo(2) },
      { status: PackageStatus.IN_TRANSIT, location: "Centro de distribución San José", occurredAt: hoursAgo(20) },
      { status: PackageStatus.OUT_FOR_DELIVERY, location: "En camión de reparto", occurredAt: hoursAgo(11) },
      {
        status: PackageStatus.DELIVERED,
        location: "San José",
        note: "Recibido por el destinatario",
        occurredAt: hoursAgo(10),
      },
    ],
  });

  await db.shippingRate.createMany({
    data: [
      {
        name: "Envío nacional terrestre",
        description: "Entrega en 24-48 horas dentro del Valle Central",
        priceCents: 350000,
        currency: "CRC",
      },
      {
        name: "Envío nacional express",
        description: "Entrega el mismo día o al siguiente, todo el país",
        priceCents: 600000,
        currency: "CRC",
      },
      {
        name: "Envío internacional aéreo",
        description: "Entrega en 5-10 días hábiles desde EE. UU.",
        priceCents: 1200000,
        currency: "CRC",
      },
      {
        name: "Recolección a domicilio",
        description: "Un mensajero pasa a recoger el paquete en su dirección",
        priceCents: 150000,
        currency: "CRC",
      },
    ],
  });

  await db.faqEntry.createMany({
    data: [
      {
        topic: "Horario de atención",
        answer:
          "Atendemos de lunes a viernes de 8:00am a 6:00pm y sábados de 8:00am a 12:00md. Domingos y feriados cerrado.",
      },
      {
        topic: "Zonas de cobertura",
        answer:
          "Cubrimos los 7 cantones centrales del Valle Central con entrega en 24-48 horas, y el resto del país en 2-4 días hábiles. También recibimos envíos internacionales desde Estados Unidos.",
      },
      {
        topic: "Cómo enviar un paquete",
        answer:
          "Puede traer su paquete a cualquiera de nuestras sucursales o solicitar que un mensajero lo recoja en su dirección. Se genera un número de guía que sirve para dar seguimiento por este mismo WhatsApp.",
      },
      {
        topic: "Tiempos estimados de entrega",
        answer:
          "Envíos nacionales: 24-48 horas en el Valle Central, 2-4 días al resto del país. Envíos internacionales desde EE. UU.: 5-10 días hábiles, sujeto a trámites de aduana.",
      },
      {
        topic: "Paquete perdido o dañado",
        answer:
          "Si su paquete llegó dañado o no ha tenido movimiento por varios días, un miembro de nuestro equipo revisará el caso personalmente y le dará seguimiento hasta resolverlo.",
      },
    ],
  });

  console.log("Seed listo. Paquetes de ejemplo: CR100001CR a CR100007CR, US900004CR.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
