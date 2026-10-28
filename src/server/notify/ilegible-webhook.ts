import { and, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { findWhatsappContact, resolveIdentity } from "@/server/inbox/identity";
import type { WebhookMessage, WebhookValue } from "@/server/inbox/webhook";

/**
 * Aviso de mensaje ilegible: POST a un webhook cuando un número DESCONOCIDO
 * manda algo que Meta entrega como `type: "unsupported"` (sin texto ni
 * referral).
 *
 * Caso real (28-oct): el anuncio de formulario de Instagram → WhatsApp con
 * tarjeta de vídeo llega así. La puerta y el agente nunca lo ven y el lead se
 * queda sin respuesta; el dueño solo lo lee en el móvil. Este aviso le dice
 * "mira este chat" para que conteste o lo reinyecte.
 *
 * Opcional como el aviso de escalado: sin `AVISO_ILEGIBLE_URL` no hace nada.
 * Una vez por remitente cada 24 h, para que un conocido que manda encuestas a
 * diario no llene el buzón.
 */

const TIMEOUT_MS = 5000;
const SILENCIO_MS = 24 * 60 * 60 * 1000;

function webhookUrl(): string | undefined {
  const raw = process.env.AVISO_ILEGIBLE_URL?.trim();
  return raw ? raw : undefined;
}

/** Hay que llamarlo ANTES de apuntar el mensaje en la caja negra. NUNCA lanza. */
export async function avisarMensajeIlegible(input: {
  organizationId: string;
  msg: WebhookMessage;
  contacts: WebhookValue["contacts"];
}): Promise<void> {
  const url = webhookUrl();
  if (!url || input.msg.type !== "unsupported") return;

  try {
    const resolved = resolveIdentity(input.msg, input.contacts);
    if (!resolved) return;
    // Un contacto del CRM ya tiene conversación: el dueño lo ve en la bandeja.
    if (await findWhatsappContact(input.organizationId, resolved)) return;

    const sender = input.msg.from ?? input.msg.from_user_id ?? null;
    if (sender) {
      const previos = await getDb()
        .select({ id: schema.webhookLog.id })
        .from(schema.webhookLog)
        .where(
          and(
            eq(schema.webhookLog.organizationId, input.organizationId),
            eq(schema.webhookLog.sender, sender),
            eq(schema.webhookLog.type, "unsupported"),
            gt(schema.webhookLog.receivedAt, new Date(Date.now() - SILENCIO_MS))
          )
        )
        .limit(1);
      if (previos[0]) return;
    }

    const ts = Number(input.msg.timestamp);
    const payload = {
      event: "mensaje_ilegible",
      occurredAt: new Date().toISOString(),
      sentAt: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null,
      organizationId: input.organizationId,
      phone: resolved.phone,
      profileName: resolved.profileName,
      waMessageId: input.msg.id ?? null,
    };

    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = process.env.HANDOFF_WEBHOOK_TOKEN?.trim();
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[ilegible-webhook] ${input.msg.id}: el destino respondió ${res.status}`);
    }
  } catch (err) {
    console.error(`[ilegible-webhook] ${input.msg.id}: aviso no entregado`, err);
  }
}
