import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyHandoff, ultimaNotaDeLaIa } from "@/server/notify/handoff-webhook";

/**
 * Aviso de escalado. Dos cosas que tienen que aguantar:
 *
 * 1. El resumen de cualificación es MULTILÍNEA y `appendLeadNote` solo marca
 *    con `[IA] ` el principio de cada nota. Un corte ingenuo por `\n` dejaría
 *    el aviso con el primer renglón y tirando el resto.
 * 2. Los guardas: sin variable, en el Laboratorio o con un motivo técnico, no
 *    se toca la red. Se comprueba espiando `fetch`, que es lo único que se ve
 *    desde fuera.
 */

const RESUMEN = [
  "Resumen del comprador",
  "Busco en: Chamberí, Madrid",
  "Presupuesto: 450.000 a 500.000 euros",
  "Habitaciones: 2",
].join("\n");

function conversacion(over: Record<string, unknown> = {}) {
  return {
    id: "conv_1",
    organizationId: "org_1",
    contactId: "contact_1",
    isTest: false,
    channel: "whatsapp",
    ...over,
  } as never;
}

describe("ultimaNotaDeLaIa", () => {
  it("sin notas, no hay nada que mandar", () => {
    expect(ultimaNotaDeLaIa(null)).toBeNull();
    expect(ultimaNotaDeLaIa("")).toBeNull();
  });

  it("devuelve el resumen multilínea ENTERO, no solo su primera línea", () => {
    expect(ultimaNotaDeLaIa(`[IA] ${RESUMEN}`)).toBe(RESUMEN);
  });

  it("con varias notas acumuladas se queda con la última completa", () => {
    const notes = `[IA] Primer contacto, quiere comprar\n[IA] ${RESUMEN}`;
    expect(ultimaNotaDeLaIa(notes)).toBe(RESUMEN);
  });

  it("una línea suelta que empiece por [IA] dentro del resumen no lo parte", () => {
    // El corte solo ocurre en salto de línea + `[IA] `, nunca a media nota.
    expect(ultimaNotaDeLaIa(`[IA] ${RESUMEN}`)).toContain("Habitaciones: 2");
  });
});

describe("notifyHandoff: guardas", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HANDOFF_WEBHOOK_URL;
  });

  it("sin HANDOFF_WEBHOOK_URL no avisa a nadie", async () => {
    await notifyHandoff(conversacion(), "modelo");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("el Laboratorio nunca avisa", async () => {
    process.env.HANDOFF_WEBHOOK_URL = "https://n8n.example.com/webhook/handoff";
    await notifyHandoff(conversacion({ isTest: true }), "modelo");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("los motivos técnicos no molestan al dueño", async () => {
    process.env.HANDOFF_WEBHOOK_URL = "https://n8n.example.com/webhook/handoff";
    await notifyHandoff(conversacion(), "ventana");
    await notifyHandoff(conversacion(), "error");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
