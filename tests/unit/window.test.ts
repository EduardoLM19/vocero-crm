import { describe, expect, it } from "vitest";
import { FRESH_MS, isFresh, isWindowOpen, WINDOW_MS, windowRemainingMs } from "@/server/inbox/window";

describe("ventana de 24 horas (FR-005)", () => {
  const now = new Date("2026-07-09T12:00:00Z");

  it("entrante hace 1 hora → abierta", () => {
    const last = new Date(now.getTime() - 60 * 60 * 1000);
    expect(isWindowOpen(last, now)).toBe(true);
  });

  it("entrante hace 25 horas → cerrada", () => {
    const last = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(isWindowOpen(last, now)).toBe(false);
  });

  it("borde exacto de 24h → cerrada (estricto)", () => {
    const last = new Date(now.getTime() - WINDOW_MS);
    expect(isWindowOpen(last, now)).toBe(false);
  });

  it("un milisegundo antes del borde → abierta", () => {
    const last = new Date(now.getTime() - WINDOW_MS + 1);
    expect(isWindowOpen(last, now)).toBe(true);
  });

  it("conversación sin ningún entrante (iniciada por plantilla) → cerrada", () => {
    expect(isWindowOpen(null, now)).toBe(false);
    expect(windowRemainingMs(null, now)).toBe(0);
  });

  it("remaining decrece y nunca es negativo", () => {
    const last = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    const remaining = windowRemainingMs(last, now);
    expect(remaining).toBe(60 * 60 * 1000);
    const old = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    expect(windowRemainingMs(old, now)).toBe(0);
  });
});

describe("frescura de 2 minutos", () => {
  const now = new Date("2026-07-09T12:00:00Z");

  it("hace 30 s → fresco", () => {
    expect(isFresh(new Date(now.getTime() - 30_000), now)).toBe(true);
  });

  it("borde exacto de 2 min → fresco", () => {
    expect(isFresh(new Date(now.getTime() - FRESH_MS), now)).toBe(true);
  });

  it("hace 3 min → viejo", () => {
    expect(isFresh(new Date(now.getTime() - 3 * 60_000), now)).toBe(false);
  });

  it("reloj del remitente adelantado (futuro) → fresco", () => {
    expect(isFresh(new Date(now.getTime() + 10_000), now)).toBe(true);
  });
});
