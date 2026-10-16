import { apiError } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { comprobarPausa } from "@/server/bot/pausa";
import { SendError, sendMediaMessage } from "@/server/inbox/send";
import { MediaValidationError } from "@/server/whatsapp/media";

export const dynamic = "force-dynamic";

const SEND_ERROR_STATUS: Record<SendError["code"], number> = {
  sandbox_violation: 409,
  not_connected: 409,
  reconnect_required: 409,
  window_closed: 409,
  meta_error: 422,
  meta_unavailable: 503,
  upload_failed: 502,
};

/**
 * Envío de un adjunto (imagen/documento/…) por el cerebro externo, A TRAVÉS
 * del CRM: mismo camino que el adjunto del composer (`sendMediaMessage`), así
 * que valida tipo y tamaño, queda en el hilo marcado como IA, respeta la
 * ventana de 24 h y el guard de sandbox.
 *
 * multipart/form-data: `conversationId` + `file` (requeridos), `caption` y
 * `permitirEnPausa` ("true") opcionales.
 *
 * 409 tipados: ai_paused · window_closed · sandbox_violation. 413/415 si el
 * archivo no pasa la validación.
 */
export async function POST(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, "invalid", "Se esperaba multipart/form-data");

  const conversationId = form.get("conversationId");
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return apiError(422, "invalid", "Falta conversationId");
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError(422, "invalid", "Falta el archivo (campo `file`)");
  }
  const captionRaw = form.get("caption");
  const caption =
    typeof captionRaw === "string" && captionRaw.trim()
      ? captionRaw.trim().slice(0, 1024)
      : undefined;
  const permitirEnPausa = form.get("permitirEnPausa") === "true";

  const pausa = await comprobarPausa(
    organizationId,
    conversationId.trim(),
    permitirEnPausa
  );
  if (pausa) return pausa;

  try {
    const result = await sendMediaMessage({
      conversationId: conversationId.trim(),
      organizationId,
      file: {
        data: Buffer.from(await file.arrayBuffer()),
        mimeType: file.type || "application/octet-stream",
        fileName: file.name || undefined,
      },
      caption,
      aiGenerated: true,
    });
    return Response.json({ messageId: result.messageId }, { status: 201 });
  } catch (err) {
    if (err instanceof MediaValidationError) {
      return apiError(
        err.code === "too_large" ? 413 : 415,
        err.code,
        err.message
      );
    }
    if (err instanceof SendError) {
      return apiError(SEND_ERROR_STATUS[err.code], err.code, err.message);
    }
    throw err;
  }
}
