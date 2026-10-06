import { and, desc, like } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { digitsOnly } from "@/lib/search";

export const dynamic = "force-dynamic";

/**
 * Caja negra del webhook (solo lectura): los últimos mensajes que llegaron de
 * Meta y qué se decidió con cada uno. `?q=` filtra por los dígitos del
 * remitente (p. ej. los 4 últimos). Sin texto de mensajes: solo metadatos.
 */
export const GET = withAuth(async (session, req: Request) => {
  const url = new URL(req.url);
  const q = digitsOnly(url.searchParams.get("q") ?? "");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

  const rows = await getDb()
    .select()
    .from(schema.webhookLog)
    .where(
      and(
        scoped(schema.webhookLog.organizationId, session.organizationId),
        q ? like(schema.webhookLog.sender, `%${q}%`) : undefined
      )
    )
    .orderBy(desc(schema.webhookLog.receivedAt))
    .limit(limit);

  return Response.json({ rows });
});
