import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findWhatsappContact = vi.fn();
vi.mock("@/server/inbox/identity", () => ({ findWhatsappContact }));

const { dejaPasarEco, dejaPasarEntrante, parsePuertaFlag, traeSenalDeAnuncio } =
  await import("@/server/inbox/puerta");

const identity = { identity: "34600111222", phone: "34600111222", waUserId: null, profileName: null };

describe("traeSenalDeAnuncio", () => {
  it("un referral de Click-to-WhatsApp basta", () => {
    expect(traeSenalDeAnuncio({ referral: { source_id: "123" }, text: "hola" })).toBe(true);
  });

  it("el marcador se encuentra sin importar acentos, mayúsculas ni espacios", () => {
    expect(
      traeSenalDeAnuncio({ text: "Hola Paola,  VÍ TU ANUNCIO y quiero info", marcador: "vi tu anuncio" })
    ).toBe(true);
  });

  it("sin referral ni marcador, no hay señal", () => {
    expect(traeSenalDeAnuncio({ text: "hola hija, ¿vienes a comer?", marcador: "vi tu anuncio" })).toBe(false);
    expect(traeSenalDeAnuncio({ text: "cualquier cosa", marcador: "" })).toBe(false);
    expect(traeSenalDeAnuncio({ text: null, marcador: "vi tu anuncio" })).toBe(false);
  });
});

describe("parsePuertaFlag", () => {
  it("apagada salvo valores explícitos", () => {
    expect(parsePuertaFlag(undefined)).toBe(false);
    expect(parsePuertaFlag("off")).toBe(false);
    expect(parsePuertaFlag(" ON ")).toBe(true);
  });
});

describe("dejaPasarEntrante / dejaPasarEco", () => {
  beforeEach(() => {
    findWhatsappContact.mockReset();
    process.env.PUERTA_MARCADOR = "vi tu anuncio";
  });
  afterEach(() => {
    delete process.env.PUERTA_ANUNCIOS;
    delete process.env.PUERTA_MARCADOR;
  });

  const base = { organizationId: "org_1", identity };

  it("con la puerta apagada entra todo y no consulta la BD", async () => {
    expect(await dejaPasarEntrante({ ...base, text: "hola" })).toBe(true);
    expect(await dejaPasarEco("org_1", identity)).toBe(true);
    expect(findWhatsappContact).not.toHaveBeenCalled();
  });

  it("encendida: un desconocido sin señal NO entra", async () => {
    process.env.PUERTA_ANUNCIOS = "on";
    findWhatsappContact.mockResolvedValue(null);
    expect(await dejaPasarEntrante({ ...base, text: "hola hija" })).toBe(false);
  });

  it("encendida: un desconocido que viene del anuncio entra", async () => {
    process.env.PUERTA_ANUNCIOS = "on";
    findWhatsappContact.mockResolvedValue(null);
    expect(await dejaPasarEntrante({ ...base, referral: { ctwa_clid: "x" }, text: "hola" })).toBe(true);
    expect(await dejaPasarEntrante({ ...base, text: "Vi tu anuncio, info por favor" })).toBe(true);
  });

  it("encendida: un contacto que ya está en el CRM entra aunque no repita la señal", async () => {
    process.env.PUERTA_ANUNCIOS = "on";
    findWhatsappContact.mockResolvedValue({ id: "ct_1" });
    expect(await dejaPasarEntrante({ ...base, text: "¿y el piso de ayer?" })).toBe(true);
  });

  it("encendida: el eco a un desconocido (su mamá) no crea contacto; a un cliente sí se registra", async () => {
    process.env.PUERTA_ANUNCIOS = "on";
    findWhatsappContact.mockResolvedValueOnce(null);
    expect(await dejaPasarEco("org_1", identity)).toBe(false);
    findWhatsappContact.mockResolvedValueOnce({ id: "ct_1" });
    expect(await dejaPasarEco("org_1", identity)).toBe(true);
  });
});
