import { describe, expect, it } from "vitest";
import { agentActionSchema } from "@/server/ai/actions";

/**
 * Una acción por turno: el cierre (guardar resumen + mover etapa + escalar)
 * tiene que caber en el handoff, o el agente se despide sin escalar.
 */
describe("acción handoff", () => {
  const schema = agentActionSchema(false);

  it("acepta nota y etapa junto a la despedida", () => {
    const parsed = schema.parse({
      action: "handoff",
      farewell: "Lo reviso yo personalmente.",
      note: "Busco en: Chamberí",
      stage: "Información completa",
    });
    expect(parsed).toMatchObject({
      action: "handoff",
      note: "Busco en: Chamberí",
      stage: "Información completa",
    });
  });

  it("sigue valiendo sin nota ni etapa", () => {
    expect(schema.parse({ action: "handoff", reason: "cliente" })).toEqual({
      action: "handoff",
      reason: "cliente",
    });
  });
});
