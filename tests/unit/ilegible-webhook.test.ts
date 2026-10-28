import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aviso de mensaje ilegible. Guardas: sin variable o con un tipo que no es
 * `unsupported` no se toca la red; un contacto conocido o un remitente ya
 * avisado en las últimas 24 h tampoco. Se espía `fetch`.
 */

const estado = vi.hoisted(() => ({ contacto: null as unknown, previos: [] as unknown[] }));

vi.mock("@/server/inbox/identity", () => ({
  resolveIdentity: (msg: { from?: string }) =>
    msg.from ? { identity: msg.from, phone: msg.from, waUserId: null, profileName: "Lead" } : null,
  findWhatsappContact: async () => estado.contacto,
}));

vi.mock("@/lib/db", () => {
  const cadena = {
    select: () => cadena,
    from: () => cadena,
    where: () => cadena,
    limit: async () => estado.previos,
  };
  return { getDb: () => cadena, schema: { webhookLog: {} } };
});

vi.mock("drizzle-orm", () => ({ and: () => null, eq: () => null, gt: () => null }));

const { avisarMensajeIlegible } = await import("@/server/notify/ilegible-webhook");

const msg = (over: Record<string, unknown> = {}) =>
  ({ id: "wamid.1", from: "34622102605", type: "unsupported", timestamp: "1761650852", ...over }) as never;

describe("avisarMensajeIlegible", () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue({ ok: true, status: 200 });
    estado.contacto = null;
    estado.previos = [];
    process.env.AVISO_ILEGIBLE_URL = "https://n8n.example.com/webhook/mensaje-ilegible";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AVISO_ILEGIBLE_URL;
  });

  it("sin AVISO_ILEGIBLE_URL no avisa", async () => {
    delete process.env.AVISO_ILEGIBLE_URL;
    await avisarMensajeIlegible({ organizationId: "org_1", msg: msg(), contacts: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("una reacción o una edición no avisan", async () => {
    await avisarMensajeIlegible({ organizationId: "org_1", msg: msg({ type: "reaction" }), contacts: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("un contacto del CRM no avisa", async () => {
    estado.contacto = { id: "ct_1" };
    await avisarMensajeIlegible({ organizationId: "org_1", msg: msg(), contacts: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("si ya se avisó de ese número en 24 h, no repite", async () => {
    estado.previos = [{ id: "whl_1" }];
    await avisarMensajeIlegible({ organizationId: "org_1", msg: msg(), contacts: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("desconocido y nuevo: avisa con el teléfono", async () => {
    await avisarMensajeIlegible({ organizationId: "org_1", msg: msg(), contacts: [] });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://n8n.example.com/webhook/mensaje-ilegible");
    const body = JSON.parse(init.body);
    expect(body.event).toBe("mensaje_ilegible");
    expect(body.phone).toBe("34622102605");
  });

  it("si el destino falla, no lanza", async () => {
    fetchSpy.mockRejectedValue(new Error("caído"));
    await expect(
      avisarMensajeIlegible({ organizationId: "org_1", msg: msg(), contacts: [] })
    ).resolves.toBeUndefined();
  });
});
