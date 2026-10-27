import { describe, expect, it } from "vitest";

import type { ClFormField } from "@/lib/supabase/types";

import {
  TABLE_MAX_CELL,
  TABLE_MAX_COLUMNS,
  formatTablePlain,
  isTableAnswered,
  parseTableAnswer,
  parseTableDefinition,
  resolveTable,
  serializeTableAnswer,
  type TableAnswer,
  type TableDefinition,
} from "./table";

const definition: TableDefinition = {
  columns: [
    { id: "c1", label: "Item" },
    { id: "c2", label: "Qtd" },
  ],
  rows: [
    { id: "r1", cells: { c1: "Cimento" } },
    { id: "r2", cells: {} },
  ],
};

function field(options: ClFormField["options"]): Pick<ClFormField, "options"> {
  return { options };
}

describe("parseTableDefinition", () => {
  it("ignora ids inválidos, duplicados e corta o texto", () => {
    const parsed = parseTableDefinition({
      columns: [
        { id: "c1", label: "A".repeat(TABLE_MAX_CELL) },
        { id: "ruim id", label: "fora" },
        { id: "c1", label: "de novo" },
        { id: "c2", label: "B" },
      ],
      rows: [
        {
          id: "r1",
          cells: { c1: "x".repeat(TABLE_MAX_CELL + 20), c2: "", sumiu: "não" },
        },
        { id: "r1", cells: { c2: "dup" } },
      ],
    });
    expect(parsed.columns.map((column) => column.id)).toEqual(["c1", "c2"]);
    expect(parsed.columns[0]?.label).toHaveLength(200);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.cells.c1).toHaveLength(TABLE_MAX_CELL);
    expect(parsed.rows[0]?.cells.c2).toBeUndefined();
    expect(parsed.rows[0]?.cells.sumiu).toBeUndefined();
  });
});

describe("resolveTable / serializeTableAnswer", () => {
  it("mantém a célula travada e guarda só o texto livre", () => {
    const answer: TableAnswer = {
      columns: [{ id: "c3", label: "Obs" }],
      rows: [
        { id: "r1", cells: { c1: "hack", c2: "10", c3: "saco" } },
        { id: "r2", cells: { c1: "Areia" } },
        { id: "rx", cells: { c2: "1" } },
      ],
    };
    const resolved = resolveTable(definition, answer);
    const first = resolved.rows[0]?.cells ?? [];
    expect(first.find((cell) => cell.columnId === "c1")).toEqual({
      columnId: "c1",
      text: "Cimento",
      locked: true,
    });
    expect(first.find((cell) => cell.columnId === "c2")?.text).toBe("10");
    expect(first.find((cell) => cell.columnId === "c3")?.locked).toBe(false);
    expect(resolved.columns.map((column) => column.id)).toEqual(["c1", "c2", "c3"]);
    expect(resolved.rows.map((row) => row.id)).toEqual(["r1", "r2", "rx"]);

    const stored = serializeTableAnswer(definition, answer);
    expect(JSON.parse(stored!)).toEqual({
      columns: [{ id: "c3", label: "Obs" }],
      rows: [
        { id: "r1", cells: { c2: "10", c3: "saco" } },
        { id: "r2", cells: { c1: "Areia" } },
        { id: "rx", cells: { c2: "1" } },
      ],
    });
  });

  it("devolve null quando não há texto livre nem linha ou coluna extra", () => {
    expect(
      serializeTableAnswer(definition, {
        columns: [],
        rows: [{ id: "r1", cells: { c1: "hack" } }],
      }),
    ).toBeNull();
  });

  it("guarda linha extra vazia e coluna extra", () => {
    const stored = serializeTableAnswer(definition, {
      columns: [{ id: "c3", label: "Obs" }],
      rows: [{ id: "rx", cells: {} }],
    });
    expect(JSON.parse(stored!)).toEqual({
      columns: [{ id: "c3", label: "Obs" }],
      rows: [{ id: "rx", cells: {} }],
    });
  });

  it("não passa do limite de colunas", () => {
    const wide: TableDefinition = {
      columns: Array.from({ length: TABLE_MAX_COLUMNS }, (_, index) => ({
        id: `c${index}`,
        label: `C${index}`,
      })),
      rows: [{ id: "r1", cells: {} }],
    };
    const stored = serializeTableAnswer(wide, {
      columns: [{ id: "extra", label: "Mais" }],
      rows: [],
    });
    expect(stored).toBeNull();
    expect(
      resolveTable(wide, { columns: [{ id: "extra", label: "Mais" }], rows: [] }).columns,
    ).toHaveLength(TABLE_MAX_COLUMNS);
  });

  it("lê de volta o JSON da resposta", () => {
    const raw = JSON.stringify({
      columns: [{ id: "c3", label: "Obs" }],
      rows: [{ id: "rx", cells: { c3: "nota" } }],
    });
    expect(parseTableAnswer(raw).rows[0]?.cells.c3).toBe("nota");
    expect(parseTableAnswer("não json")).toEqual({ columns: [], rows: [] });
  });
});

describe("isTableAnswered", () => {
  const options = field(definition);

  it("exige as células livres das linhas do template", () => {
    expect(isTableAnswered(options, null)).toBe(false);
    const partial = JSON.stringify({
      columns: [],
      rows: [{ id: "r1", cells: { c2: "10" } }],
    });
    expect(isTableAnswered(options, partial)).toBe(false);
    const done = JSON.stringify({
      columns: [],
      rows: [
        { id: "r1", cells: { c2: "10" } },
        { id: "r2", cells: { c1: "Areia", c2: "2" } },
      ],
    });
    expect(isTableAnswered(options, done)).toBe(true);
  });

  it("ignora coluna extra vazia e linha extra", () => {
    const raw = JSON.stringify({
      columns: [{ id: "c3", label: "Obs" }],
      rows: [
        { id: "r1", cells: { c2: "10" } },
        { id: "r2", cells: { c1: "Areia", c2: "2" } },
        { id: "rx", cells: {} },
      ],
    });
    expect(isTableAnswered(options, raw)).toBe(true);
  });

  it("conta como respondida quando todas as células estão travadas", () => {
    expect(
      isTableAnswered(
        field({
          columns: [{ id: "c1", label: "Item" }],
          rows: [{ id: "r1", cells: { c1: "Pronto" } }],
        }),
        null,
      ),
    ).toBe(true);
  });
});

describe("formatTablePlain", () => {
  it("junta o texto visível e omite JSON", () => {
    const raw = JSON.stringify({
      columns: [],
      rows: [{ id: "r1", cells: { c2: "10" } }],
    });
    expect(formatTablePlain(field(definition), raw)).toBe("Cimento · 10");
    expect(formatTablePlain(field(definition), null)).toBe("Cimento");
  });
});
