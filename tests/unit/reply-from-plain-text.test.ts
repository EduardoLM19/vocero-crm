import { describe, expect, it } from "vitest";
import { replyFromPlainText } from "@/server/ai/pipeline";

describe("replyFromPlainText", () => {
  it("un mensaje al cliente en texto plano se aprovecha como reply", () => {
    expect(
      replyFromPlainText("  Entendido. Además del balcón, ¿necesitas algo más?  ")
    ).toEqual({ action: "reply", text: "Entendido. Además del balcón, ¿necesitas algo más?" });
  });

  it("vacío o JSON roto no se manda al cliente", () => {
    expect(replyFromPlainText("   ")).toBeNull();
    expect(replyFromPlainText('{"action":"reply","text":"hola"')).toBeNull();
  });

  it("un texto desmesurado no se manda", () => {
    expect(replyFromPlainText("a".repeat(1001))).toBeNull();
  });
});
