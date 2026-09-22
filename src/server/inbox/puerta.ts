import { findWhatsappContact, type ResolvedIdentity } from "@/server/inbox/identity";
import type { WebhookReferral } from "@/server/inbox/webhook";

/**
 * Puerta de entrada para números en coexistencia.
 *
 * Un número que el dueño usa también para su vida personal recibe a la familia
 * y a los amigos. Con la puerta encendida, un remitente DESCONOCIDO solo entra
 * al CRM si trae señal de venir de un anuncio; si no, el mensaje se descarta
 * antes de crear contacto, guardar texto o llamar al modelo. En coexistencia no
 * se pierde nada: el dueño lo sigue viendo en la app del teléfono.
 *
 * No es una lista blanca de clientes (un cliente nuevo es por definición un
 * número nunca visto): es silencio por defecto + señal positiva de procedencia.
 */

const ON_VALUES = new Set(["on", "1", "true", "si", "sí", "yes"]);

export function parsePuertaFlag(raw: string | undefined): boolean {
  return ON_VALUES.has((raw ?? "").trim().toLowerCase());
}

export function puertaEnabled(): boolean {
  return parsePuertaFlag(process.env.PUERTA_ANUNCIOS);
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function traeSenalDeAnuncio(input: {
  referral?: WebhookReferral | null;
  text?: string | null;
  marcador?: string | null;
}): boolean {
  // El referral lo pone Meta; el usuario no puede falsificarlo ni borrarlo.
  if (input.referral) return true;
  const marcador = normalizar(input.marcador ?? "");
  if (!marcador || !input.text) return false;
  return normalizar(input.text).includes(marcador);
}

/** Decide si un mensaje ENTRANTE de WhatsApp pasa al CRM. */
export async function dejaPasarEntrante(input: {
  organizationId: string;
  identity: ResolvedIdentity;
  referral?: WebhookReferral | null;
  text?: string | null;
}): Promise<boolean> {
  if (!puertaEnabled()) return true;
  if (
    traeSenalDeAnuncio({
      referral: input.referral,
      text: input.text,
      marcador: process.env.PUERTA_MARCADOR,
    })
  ) {
    return true;
  }
  return (await findWhatsappContact(input.organizationId, input.identity)) != null;
}

/** Un eco (respuesta del dueño desde el teléfono) solo se registra si el contacto ya está en el CRM. */
export async function dejaPasarEco(
  organizationId: string,
  identity: ResolvedIdentity
): Promise<boolean> {
  if (!puertaEnabled()) return true;
  return (await findWhatsappContact(organizationId, identity)) != null;
}

/** Para el log: nunca el número entero. */
export function ultimos4(identity: string): string {
  return `…${identity.slice(-4)}`;
}
