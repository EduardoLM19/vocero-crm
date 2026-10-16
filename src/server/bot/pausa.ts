import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { apiError } from "@/lib/api";

/**
 * Gate de handoff compartido por todo envío del bot (texto y adjuntos).
 * El bot JAMÁS habla sobre una conversación pausada, salvo que pida
 * explícitamente `permitirEnPausa` (envíos automáticos justo tras el handoff).
 */
export function botPuedeHablar(
  conv: { aiEnabled: boolean; handoffAt: Date | null },
  permitirEnPausa?: boolean
): boolean {
  if (permitirEnPausa) return true;
  return conv.aiEnabled && !conv.handoffAt;
}

/**
 * Relee la conversación (entre que el bot pidió el contexto y envía, el dueño
 * pudo tomarla) y devuelve la Response de error si no puede hablar, o null.
 */
export async function comprobarPausa(
  organizationId: string,
  conversationId: string,
  permitirEnPausa?: boolean
): Promise<Response | null> {
  const db = getDb();
  const convs = await db
    .select({
      aiEnabled: schema.conversation.aiEnabled,
      handoffAt: schema.conversation.handoffAt,
    })
    .from(schema.conversation)
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    )
    .limit(1);
  const conv = convs[0];
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");
  if (!botPuedeHablar(conv, permitirEnPausa)) {
    return apiError(409, "ai_paused", "La IA está en pausa en esta conversación");
  }
  return null;
}
