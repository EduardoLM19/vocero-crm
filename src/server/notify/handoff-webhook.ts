import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Aviso de escalado: POST a un webhook cuando una conversación pasa a manos
 * humanas.
 *
 * Vocero ya marca el handoff en la base de datos y pinta "Atención humana" en
 * la bandeja, pero no avisa a NADIE: el dueño solo se entera si tiene el CRM
 * abierto delante y mira. El evento SSE muere en las pestañas que ya estaban
 * abiertas. En un negocio de una sola persona —y con el agente cubriendo fuera
 * de horario— eso significa que un lead escalado a las 22:30 espera a que
 * alguien abra el CRM por la mañana.
 *
 * Misma decisión de despliegue que `AGENDA` (ADR-001): el código viaja siempre
 * en main y lo que decide si EXISTE es una variable de entorno. Sin
 * `HANDOFF_WEBHOOK_URL` esto no hace absolutamente nada y la instancia se
 * comporta exactamente igual que antes de existir este archivo.
 */

/**
 * Solo los motivos que necesitan a una PERSONA.
 *
 * `error` (se cayó el proveedor de IA) y `ventana` (pasaron 24h y ya no se
 * puede mandar texto libre) son técnicos: quien recibe el aviso no sabría qué
 * hacer con ellos, y el ruido enseña a ignorar los avisos que sí importan.
 * Viajan igual en el payload por si el otro lado quiere enrutarlos a otro
 * sitio, pero no se envían desde aquí.
 */
const MOTIVOS_QUE_AVISAN = new Set(["modelo", "cliente"]);

const ETIQUETAS: Record<string, string> = {
  modelo: "El agente decidió escalar",
  cliente: "El cliente pidió hablar con una persona",
};

/** Corto a propósito: el aviso no puede quedarse colgado del turno. */
const TIMEOUT_MS = 5000;

/** Las notas acumulan todo el historial; el aviso solo necesita el final. */
const MAX_NOTA = 2000;

type Conversation = typeof schema.conversation.$inferSelect;

function webhookUrl(): string | undefined {
  const raw = process.env.HANDOFF_WEBHOOK_URL?.trim();
  return raw ? raw : undefined;
}

/**
 * Último bloque escrito por la IA en las notas del contacto.
 *
 * `appendLeadNote` marca con `[IA] ` el PRINCIPIO de cada nota, no cada línea,
 * y el resumen de cualificación es multilínea. Partir por `\n` a secas se
 * llevaría por delante todo menos el primer renglón: hay que cortar solo donde
 * empieza una nota nueva.
 */
export function ultimaNotaDeLaIa(notes: string | null): string | null {
  if (!notes) return null;
  const bloques = notes.split(/\n(?=\[IA\] )/);
  const ultimo = bloques[bloques.length - 1]?.replace(/^\[IA\] /, "").trim();
  return ultimo ? ultimo.slice(0, MAX_NOTA) : null;
}

/**
 * Entrega el aviso. NUNCA lanza: cuando se llama, el handoff ya está escrito
 * en la base de datos y la conversación ya salió marcada en la bandeja. Un
 * webhook caído no puede costar un escalado.
 */
export async function notifyHandoff(
  conversation: Conversation,
  reason: string
): Promise<void> {
  const url = webhookUrl();
  if (!url) return;
  // El Laboratorio jamás avisa: cada corrida de evaluación escala varias veces
  // y le reventaría el teléfono al dueño con clientes que no existen.
  if (conversation.isTest) return;
  if (!MOTIVOS_QUE_AVISAN.has(reason)) return;

  try {
    const db = getDb();
    const filas = await db
      .select({
        id: schema.contact.id,
        name: schema.contact.name,
        phone: schema.contact.phone,
        waIdentity: schema.contact.waIdentity,
        notes: schema.contact.notes,
        ficha: schema.contact.ficha,
      })
      .from(schema.contact)
      .where(eq(schema.contact.id, conversation.contactId))
      .limit(1);
    const contacto = filas[0];

    const base = process.env.APP_BASE_URL?.trim();

    const payload = {
      event: "handoff",
      reason,
      reasonLabel: ETIQUETAS[reason] ?? reason,
      occurredAt: new Date().toISOString(),
      organizationId: conversation.organizationId,
      conversation: {
        id: conversation.id,
        channel: conversation.channel,
      },
      contact: contacto
        ? {
            id: contacto.id,
            name: contacto.name,
            phone: contacto.phone,
            waIdentity: contacto.waIdentity,
            // Lo que hace útil el aviso: el resumen que acaba de levantar la
            // IA, para poder leerlo sin abrir el CRM.
            lastNote: ultimaNotaDeLaIa(contacto.notes),
            ficha: contacto.ficha ?? null,
          }
        : null,
      // Enlace directo a la bandeja. La conversación se abre por CONTACTO
      // (`/inbox?contact=`), no por id de conversación.
      url:
        base && contacto ? `${base}/inbox?contact=${contacto.id}` : null,
    };

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const token = process.env.HANDOFF_WEBHOOK_TOKEN?.trim();
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(
        `[handoff-webhook] ${conversation.id}: el destino respondió ${res.status}`
      );
    }
  } catch (err) {
    console.error(`[handoff-webhook] ${conversation.id}: aviso no entregado`, err);
  }
}
