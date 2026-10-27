import type { ClFormField, FieldOptions } from "@/lib/supabase/types";

export const TABLE_MAX_COLUMNS = 20;
export const TABLE_MAX_ROWS = 50;
export const TABLE_MAX_LABEL = 200;
export const TABLE_MAX_CELL = 500;

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export interface TableColumn {
  id: string;
  label: string;
}

export interface TableRow {
  id: string;
  cells: Record<string, string>;
}

export interface TableDefinition {
  columns: TableColumn[];
  rows: TableRow[];
}

export type TableAnswer = TableDefinition;

export interface ResolvedCell {
  columnId: string;
  text: string;
  locked: boolean;
}

export interface ResolvedColumn extends TableColumn {
  extra: boolean;
}

export interface ResolvedRow {
  id: string;
  extra: boolean;
  cells: ResolvedCell[];
}

export interface ResolvedTable {
  columns: ResolvedColumn[];
  rows: ResolvedRow[];
}

export function createTableId(prefix: "col" | "row"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultTable(): TableDefinition {
  const first = createTableId("col");
  const second = createTableId("col");
  return {
    columns: [
      { id: first, label: "Coluna 1" },
      { id: second, label: "Coluna 2" },
    ],
    rows: [
      { id: createTableId("row"), cells: {} },
      { id: createTableId("row"), cells: {} },
    ],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseColumns(raw: unknown, limit: number): TableColumn[] {
  if (!Array.isArray(raw)) return [];
  const columns: TableColumn[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (columns.length >= limit) break;
    const record = asRecord(item);
    if (!record) continue;
    const id = typeof record.id === "string" ? record.id : "";
    if (!ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    const label =
      typeof record.label === "string" ? record.label.slice(0, TABLE_MAX_LABEL) : "";
    columns.push({ id, label });
  }
  return columns;
}

function parseRows(
  raw: unknown,
  columnIds: Set<string> | null,
  limit: number,
): TableRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: TableRow[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (rows.length >= limit) break;
    const record = asRecord(item);
    if (!record) continue;
    const id = typeof record.id === "string" ? record.id : "";
    if (!ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    const cells: Record<string, string> = {};
    const rawCells = asRecord(record.cells);
    if (rawCells) {
      for (const [key, value] of Object.entries(rawCells)) {
        if (!ID_RE.test(key)) continue;
        if (columnIds && !columnIds.has(key)) continue;
        if (typeof value !== "string") continue;
        const text = value.slice(0, TABLE_MAX_CELL);
        if (text === "") continue;
        cells[key] = text;
      }
    }
    rows.push({ id, cells });
  }
  return rows;
}

export function parseTableDefinition(
  options: FieldOptions | null | undefined,
): TableDefinition {
  const record = asRecord(options);
  if (!record) return { columns: [], rows: [] };
  const columns = parseColumns(record.columns, TABLE_MAX_COLUMNS);
  const columnIds = new Set(columns.map((column) => column.id));
  return {
    columns,
    rows: parseRows(record.rows, columnIds, TABLE_MAX_ROWS),
  };
}

export function parseTableAnswer(raw: string | null | undefined): TableAnswer {
  if (!raw) return { columns: [], rows: [] };
  try {
    const record = asRecord(JSON.parse(raw) as unknown);
    if (!record) return { columns: [], rows: [] };
    return {
      columns: parseColumns(record.columns, TABLE_MAX_COLUMNS),
      rows: parseRows(record.rows, null, TABLE_MAX_ROWS * 2),
    };
  } catch {
    return { columns: [], rows: [] };
  }
}

function isLockedPreset(row: TableRow, columnId: string, presetColumnIds: Set<string>) {
  return presetColumnIds.has(columnId) && (row.cells[columnId] ?? "").trim() !== "";
}

export function resolveTable(
  definition: TableDefinition,
  answer: TableAnswer,
): ResolvedTable {
  const presetColumnIds = new Set(definition.columns.map((column) => column.id));
  const presetRowIds = new Set(definition.rows.map((row) => row.id));
  const extraColumns = answer.columns
    .filter((column) => !presetColumnIds.has(column.id))
    .slice(0, Math.max(0, TABLE_MAX_COLUMNS - definition.columns.length));
  const columns: ResolvedColumn[] = [
    ...definition.columns.map((column) => ({ ...column, extra: false })),
    ...extraColumns.map((column) => ({ ...column, extra: true })),
  ];
  const columnIds = columns.map((column) => column.id);
  const answerRows = new Map(answer.rows.map((row) => [row.id, row]));

  const presetRows: ResolvedRow[] = definition.rows.map((row) => {
    const answered = answerRows.get(row.id);
    return {
      id: row.id,
      extra: false,
      cells: columnIds.map((columnId) => {
        const locked = isLockedPreset(row, columnId, presetColumnIds);
        return {
          columnId,
          locked,
          text: locked ? (row.cells[columnId] ?? "") : (answered?.cells[columnId] ?? ""),
        };
      }),
    };
  });

  const extraRoom = Math.max(0, TABLE_MAX_ROWS - presetRows.length);
  const extraRows: ResolvedRow[] = answer.rows
    .filter((row) => !presetRowIds.has(row.id))
    .slice(0, extraRoom)
    .map((row) => ({
      id: row.id,
      extra: true,
      cells: columnIds.map((columnId) => ({
        columnId,
        locked: false,
        text: row.cells[columnId] ?? "",
      })),
    }));

  return { columns, rows: [...presetRows, ...extraRows] };
}

function freeCells(
  cells: Record<string, string>,
  allowed: Set<string>,
  presetRow: TableRow | undefined,
  presetColumnIds: Set<string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [columnId, text] of Object.entries(cells)) {
    if (!allowed.has(columnId)) continue;
    if (presetRow && isLockedPreset(presetRow, columnId, presetColumnIds)) continue;
    const clipped = text.slice(0, TABLE_MAX_CELL);
    if (clipped.trim() === "") continue;
    next[columnId] = clipped;
  }
  return next;
}

/** JSON só com o que a resposta escreveu. `null` se não houver texto livre nem linha/coluna extra. */
export function serializeTableAnswer(
  definition: TableDefinition,
  answer: TableAnswer,
): string | null {
  const presetColumnIds = new Set(definition.columns.map((column) => column.id));
  const presetRows = new Map(definition.rows.map((row) => [row.id, row]));
  const extraColumns = answer.columns
    .filter((column) => !presetColumnIds.has(column.id))
    .slice(0, Math.max(0, TABLE_MAX_COLUMNS - definition.columns.length))
    .map((column) => ({
      id: column.id,
      label: column.label.slice(0, TABLE_MAX_LABEL),
    }));
  const allowed = new Set([
    ...definition.columns.map((column) => column.id),
    ...extraColumns.map((column) => column.id),
  ]);

  const presetAnswers: TableRow[] = [];
  for (const row of definition.rows) {
    const answered = answer.rows.find((item) => item.id === row.id);
    if (!answered) continue;
    const cells = freeCells(answered.cells, allowed, row, presetColumnIds);
    if (Object.keys(cells).length > 0) presetAnswers.push({ id: row.id, cells });
  }

  const extraRows = answer.rows
    .filter((row) => !presetRows.has(row.id))
    .slice(0, Math.max(0, TABLE_MAX_ROWS - definition.rows.length))
    .map((row) => ({
      id: row.id,
      cells: freeCells(row.cells, allowed, undefined, presetColumnIds),
    }));

  if (extraColumns.length === 0 && extraRows.length === 0 && presetAnswers.length === 0) {
    return null;
  }

  return JSON.stringify({
    columns: extraColumns,
    rows: [...presetAnswers, ...extraRows],
  });
}

export function resolveFieldTable(
  field: Pick<ClFormField, "options">,
  raw: string | null | undefined,
): ResolvedTable {
  return resolveTable(parseTableDefinition(field.options), parseTableAnswer(raw));
}

/** Obrigatório: toda célula livre das linhas do template, nas colunas do template, preenchida. */
export function isTableAnswered(
  field: Pick<ClFormField, "options">,
  raw: string | null | undefined,
): boolean {
  const definition = parseTableDefinition(field.options);
  const resolved = resolveTable(definition, parseTableAnswer(raw));
  const presetColumnIds = new Set(
    resolved.columns.filter((column) => !column.extra).map((column) => column.id),
  );
  for (const row of resolved.rows) {
    if (row.extra) continue;
    for (const cell of row.cells) {
      if (!presetColumnIds.has(cell.columnId)) continue;
      if (!cell.locked && cell.text.trim() === "") return false;
    }
  }
  return true;
}

export function tableHasVisibleText(
  field: Pick<ClFormField, "options">,
  raw: string | null | undefined,
): boolean {
  const resolved = resolveFieldTable(field, raw);
  return resolved.rows.some((row) => row.cells.some((cell) => cell.text.trim() !== ""));
}

export function formatTablePlain(
  field: Pick<ClFormField, "options">,
  raw: string | null | undefined,
): string {
  const resolved = resolveFieldTable(field, raw);
  const lines = resolved.rows
    .map((row) =>
      row.cells
        .map((cell) => cell.text.trim())
        .filter(Boolean)
        .join(" · "),
    )
    .filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : "—";
}
