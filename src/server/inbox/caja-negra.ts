import { lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import type { WebhookMessage } from "@/server/inbox/webhook";

/**
 * Caja negra del webhook: apunta cada mensaje entrante (solo metadatos, nunca
 * el texto) y qué se decidió con él. Nunca lanza: si la BD falla, el mensaje
 * se procesa igual y solo queda un aviso en el log.
 */

export type DecisionCajaNegra =
  (typeof schema.webhookLog.$inferInsert)["decision"];

const RETENCION_MS = 7 * 24 * 60 * 60 * 1000;

export async function registrarEnCajaNegra(input: {
  organizationId: string;
  phoneNumberId: string | null;
  msg: WebhookMessage;
  decision: DecisionCajaNegra;
}): Promise<void> {
  const { msg } = input;
  const sender = msg.from ?? msg.from_user_id ?? null;
  const ts = Number(msg.timestamp);
  try {
    await getDb()
      .insert(schema.webhookLog)
      .values({
        id: newId("webhookLog"),
        organizationId: input.organizationId,
        phoneNumberId: input.phoneNumberId,
        waMessageId: msg.id ?? null,
        sender,
        senderKind: msg.from ? "phone" : msg.from_user_id ? "bsuid" : "none",
        type: msg.type ?? "desconocido",
        waTimestamp: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : null,
        hasReferral: msg.referral != null,
        referralSourceId: msg.referral?.source_id ?? null,
        referralSourceType: msg.referral?.source_type ?? null,
        referralHeadline: msg.referral?.headline ?? null,
        decision: input.decision,
      });
    // Limpieza barata: ~1 de cada 20 inserciones borra lo de más de 7 días.
    if (Math.random() < 0.05) {
      await getDb()
        .delete(schema.webhookLog)
        .where(lt(schema.webhookLog.receivedAt, new Date(Date.now() - RETENCION_MS)));
    }
  } catch (err) {
    console.warn(`[caja-negra] no se pudo registrar ${msg.id}:`, err);
  }
}
