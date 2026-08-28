// en-GB: Verifies locale catalogue parity so a supported language cannot silently lose labels.
import { describe, expect, it } from "vitest";
import { messages } from "./i18n";

describe("frontend locale catalogue", () => {
  it("keeps pt-BR and en-GB keys identical and non-empty", () => {
    const portugueseKeys = Object.keys(messages["pt-BR"]).sort();
    const englishKeys = Object.keys(messages["en-GB"]).sort();

    expect(englishKeys).toEqual(portugueseKeys);
    for (const locale of ["pt-BR", "en-GB"] as const) {
      expect(Object.values(messages[locale]).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("provides English presentation labels for each audited operational surface", () => {
    expect(messages["en-GB"]).toMatchObject({
      skipToMainContent: "Skip to main content",
      signOut: "Sign out",
      statusLegend: "Status legend",
      roleDetails: "Role details",
      activityDetail: "Activity details",
      activityTaskBoard: "Activity task board",
      noMovements: "No movements"
    });
  });

  it("keeps audited Portuguese presentation labels grammatical and semantic", () => {
    expect(messages["pt-BR"]).toMatchObject({
      skipToMainContent: "Ir para o conteúdo principal",
      users: "Gestão de Usuários",
      code: "Código",
      description: "Descrição",
      security: "Segurança",
      page: "Página",
      next: "Próxima",
      refresh: "Atualizar",
      slaBreached: "SLA violado"
    });
  });
});
