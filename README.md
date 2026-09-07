# Asistente Virtual de WhatsApp para Couriers (MVP)

Bot conversacional para una empresa de courier que atiende por WhatsApp Business (via Twilio), usa Claude (Anthropic) para entender al cliente y ejecutar acciones (dar seguimiento a un paquete, cotizar tarifas, responder preguntas frecuentes, escalar a un humano), y guarda todo en PostgreSQL como CRM base (paquetes, historial de movimientos, conversaciones, escalamientos).

Este proyecto es la segunda variante del [bot de clínicas](../Claude%20Code) de InnLab CR: misma arquitectura (Express + Twilio + Claude tool-use + Prisma/Postgres + panel admin + Sentry), dominio distinto.

## Arquitectura

```
Cliente (WhatsApp) --> Twilio --> Webhook Express (/webhook/whatsapp)
                                        |
                                        v
                          Claude (tool use) <--> PostgreSQL (Prisma)
                                        |
                                        v
                    TrackingProvider (hoy: simulado, mañana: API real del courier)
```

- **Twilio** recibe y envia mensajes de WhatsApp Business.
- **Claude** (`claude-opus-4-8` via `@anthropic-ai/sdk`) lleva la conversacion y decide cuando llamar "herramientas" (tools) para rastrear un paquete, consultar tarifas, consultar informacion general o escalar a un humano. Nunca inventa el estado de un paquete ni precios: todo pasa por la base de datos.
- **PostgreSQL + Prisma** guarda los paquetes y su historial de movimientos, el catalogo de tarifas, la base de conocimiento (FAQ), el historial de conversacion y los escalamientos.
- Endpoints `/admin/*` (protegidos con una API key) permiten consultar paquetes y estadisticas basicas para integraciones futuras.
- El panel `/panel` le da control al equipo de operaciones sin tocar la base de datos directamente.

## Tracking ficticio por ahora / como conectar el API real

El cliente pidio conectar el bot a una plataforma de tracking de paquetes global, pero **todavia no se conoce cual API usan** (no hay proveedor confirmado). Para no bloquear el desarrollo, el "estado del paquete" hoy vive en nuestra propia base de datos (tablas `Package` y `TrackingEvent`), y un job de fondo (`packageProgressionScheduler`) los va avanzando con el tiempo (PENDIENTE → RECOLECTADO → EN TRANSITO → EN REPARTO → ENTREGADO, con alguna incidencia ocasional) para que la demo se sienta como una sincronizacion real. El staff tambien puede forzar cualquier estado desde el panel (`/panel/paquetes/:id`) para una demo en vivo.

Toda esta logica esta detras de una interfaz en `src/lib/trackingProvider.ts`:

```ts
export interface TrackingProvider {
  getStatus(trackingNumber: string): Promise<PackageSnapshot | null>;
}
```

`MockTrackingProvider` es la implementacion actual. El dia que el cliente confirme el proveedor real, el cambio es:

1. Crear `RealCarrierTrackingProvider implements TrackingProvider` en el mismo archivo (o uno nuevo), llamando el API real y mapeando su respuesta al mismo `PackageSnapshot`.
2. Cambiar `getTrackingProvider()` para que devuelva esa clase en vez de `MockTrackingProvider`.

**Cero cambios** en `src/lib/anthropic.ts` (las tools de Claude), en las rutas, ni en el panel -- todos consumen la interfaz, no la implementacion.

## Requisitos

- Node.js 20+
- Una base de datos PostgreSQL (recomendado para arrancar rapido: [Supabase](https://supabase.com) o [Neon](https://neon.tech), ambos con plan gratuito)
- Cuenta de [Twilio](https://www.twilio.com/whatsapp) con el sandbox de WhatsApp activado (o un numero de WhatsApp Business aprobado para produccion)
- API key de [Anthropic](https://console.anthropic.com/)

## Instalacion

```bash
npm install
cp .env.example .env
# Edita .env con tus credenciales (ver siguiente seccion)

npm run db:generate
npm run db:migrate      # crea las tablas
npm run db:seed         # crea paquetes de ejemplo, tarifas e informacion general

npm run dev              # levanta el servidor en http://localhost:3002
```

## Demo sin WhatsApp real (`/demo`)

Mientras no haya una cuenta de Twilio con acceso completo (los trials nuevos exigen que **todo** mensaje saliente use una plantilla pre-aprobada -- error `21654 ContentSid Required` -- lo cual bloquea las respuestas dinamicas del bot), existe una ruta que simula un chat de WhatsApp y habla directo con la misma logica del bot (`processIncomingMessage`), sin pasar por Twilio para nada:

- **`GET /demo`** -- pagina de chat con apariencia de WhatsApp (funciona en el navegador, movil o escritorio). Cada visitante tiene su propia conversacion (id aleatorio guardado en `localStorage`), separada de los numeros reales de WhatsApp (se guarda como `web:<id>`, nunca como `whatsapp:+...`).
- **`POST /demo/api/message`** -- endpoint que usa la pagina, protegido con un rate limit (40 mensajes / 10 min por IP) para evitar abuso, ya que cada mensaje consume tokens de Claude.
- Estas conversaciones tambien quedan visibles en `/panel/conversaciones`, igual que las de WhatsApp real.
- Es publico (pensado para compartirle el link directo al cliente sin pedirle contraseña) -- si se quiere restringir mas adelante, se le puede agregar el mismo mecanismo de cookie que usa `/panel`.

Cuando se resuelva el acceso a Twilio (cuenta con saldo, o WhatsApp Business real), el flujo por WhatsApp (`/webhook/whatsapp`) queda intacto y no depende en nada de esta demo.

## Variables de entorno clave

Ver `.env.example` para la lista completa. Las mas importantes:

| Variable | Para que sirve |
|---|---|
| `DATABASE_URL` | Conexion a PostgreSQL |
| `ANTHROPIC_API_KEY` | Autenticacion con la API de Claude |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Credenciales de Twilio |
| `TWILIO_WHATSAPP_NUMBER` | Numero de WhatsApp desde el que responde el bot |
| `COURIER_NAME` | Nombre de la empresa, usado en el saludo del bot y el panel |
| `STAFF_WHATSAPP_NUMBER` / `STAFF_EMAIL` | A donde se notifica cada escalamiento a un humano |
| `ADMIN_API_KEY` | Protege los endpoints `/admin/*` y es la contraseña del panel `/panel` |

## Conectar Twilio (modo desarrollo, con sandbox)

1. En la consola de Twilio, activa el **WhatsApp Sandbox** (Messaging > Try it out > Send a WhatsApp message).
2. Expón tu servidor local a internet (por ejemplo con `ngrok http 3002`).
3. En la configuracion del sandbox, pon como webhook "WHEN A MESSAGE COMES IN": `https://<tu-ngrok>.ngrok.io/webhook/whatsapp`, metodo `POST`.
4. Desde tu WhatsApp personal, envia el codigo de activacion del sandbox al numero de Twilio, y luego escribele cualquier mensaje para probar el bot.

Para produccion, se reemplaza el sandbox por un numero de WhatsApp Business real aprobado por Meta a traves de Twilio, pero el webhook y el codigo no cambian (ver el documento de "Costos y ruta a produccion" del bot de clinica -- la misma ruta aplica aqui).

## Flujo implementado

1. El cliente escribe al WhatsApp del courier.
2. Claude saluda y pregunta en que puede ayudar.
3. Si da un numero de guia -> `track_package` consulta el `TrackingProvider` y responde con el estado actual y el ultimo movimiento.
4. Si pregunta precios -> `get_shipping_rates` (tabla `ShippingRate`).
5. Si pregunta horarios, cobertura, como enviar un paquete, politica de reclamos, etc. -> `get_general_info` (tabla `FaqEntry`, editable desde el panel).
6. Si el paquete parece perdido/dañado, hay un reclamo formal, o el cliente pide hablar con una persona -> `escalate_to_human`, que notifica al equipo de operaciones por WhatsApp y/o correo.
7. Cuando un paquete se marca como `DELIVERED`, entre 2 y 26 horas despues se le manda una encuesta de satisfaccion (NPS) por WhatsApp; la respuesta numerica se captura directamente sin pasar por Claude.

## Panel de administracion (`/panel`)

- **Paquetes**: listado con busqueda, alta manual de paquetes (simula la sincronizacion), boton "Avanzar" para el siguiente estado logico, y vista de detalle con linea de tiempo + control manual de estado (util para demos en vivo).
- **Tarifas**: catalogo de precios que usa el bot, editable inline.
- **Información**: base de conocimiento (FAQ) que usa el bot, editable inline.
- **Conversaciones**: transcripciones de todas las sesiones, con las escalaciones marcadas.
- **Estadísticas**: paquetes por estado, tasa de incidencias, NPS promedio, escalaciones.

## Endpoints administrativos

Todos requieren el header `x-admin-key: <ADMIN_API_KEY>`.

- `GET /admin/packages?status=&q=` — lista paquetes con su historial (filtros opcionales).
- `GET /admin/stats` — conteos basicos (total, entregados, en curso, incidencias, escalamientos abiertos).

## Fuera de alcance en este MVP (decidido con el cliente)

- No hay agendamiento de recolección de paquetes (se evaluo y se descarto para mantener el alcance simple: tracking + consultas).
- No hay registro de clientes/CRM de contactos — el tracking no requiere cuenta, igual que un courier real.
- La conexion al API de tracking real queda pendiente de que el cliente confirme el proveedor (ver seccion de arriba).
