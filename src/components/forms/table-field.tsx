"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TABLE_MAX_CELL,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_LABEL,
  TABLE_MAX_ROWS,
  createTableId,
  parseTableAnswer,
  parseTableDefinition,
  resolveTable,
  serializeTableAnswer,
  type TableAnswer,
} from "@/lib/forms/table";
import type { ClFormField } from "@/lib/supabase/types";

export function TableFieldControl({
  field,
  value,
  disabled = false,
  onChange,
}: {
  field: Pick<ClFormField, "options">;
  value: string | null | undefined;
  disabled?: boolean;
  onChange: (next: string | null) => void;
}) {
  const definition = parseTableDefinition(field.options);
  const answer = parseTableAnswer(value);
  const resolved = resolveTable(definition, answer);
  const [columnName, setColumnName] = useState("");
  const canAddColumn = resolved.columns.length < TABLE_MAX_COLUMNS;
  const canAddRow = resolved.rows.length < TABLE_MAX_ROWS;

  function commit(next: TableAnswer) {
    onChange(serializeTableAnswer(definition, next));
  }

  function updateCell(rowId: string, columnId: string, text: string) {
    const clipped = text.slice(0, TABLE_MAX_CELL);
    const rows = answer.rows.some((row) => row.id === rowId)
      ? answer.rows.map((row) =>
          row.id === rowId
            ? { ...row, cells: { ...row.cells, [columnId]: clipped } }
            : row,
        )
      : [...answer.rows, { id: rowId, cells: { [columnId]: clipped } }];
    commit({ ...answer, rows });
  }

  function addColumn() {
    if (!canAddColumn || disabled) return;
    const label =
      columnName.trim().slice(0, TABLE_MAX_LABEL) ||
      `Coluna ${resolved.columns.length + 1}`;
    commit({
      ...answer,
      columns: [...answer.columns, { id: createTableId("col"), label }],
    });
    setColumnName("");
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40">
              {resolved.columns.map((column) => (
                <th
                  key={column.id}
                  className="min-w-36 border-b p-1.5 text-left font-medium"
                >
                  {column.extra && !disabled ? (
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-8"
                        value={column.label}
                        maxLength={TABLE_MAX_LABEL}
                        aria-label="Nome da coluna"
                        onChange={(event) =>
                          commit({
                            ...answer,
                            columns: answer.columns.map((item) =>
                              item.id === column.id
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                      <button
                        type="button"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Remover coluna"
                        onClick={() =>
                          commit({
                            ...answer,
                            columns: answer.columns.filter(
                              (item) => item.id !== column.id,
                            ),
                          })
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="block px-1 py-1">{column.label || "Coluna"}</span>
                  )}
                </th>
              ))}
              {!disabled ? <th className="w-8 border-b" /> : null}
            </tr>
          </thead>
          <tbody>
            {resolved.rows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell) => (
                  <td key={cell.columnId} className="border-t p-1.5 align-top">
                    {cell.locked ? (
                      <span className="flex min-h-8 items-start px-1 py-1.5 text-sm">
                        <span className="whitespace-pre-wrap">{cell.text}</span>
                      </span>
                    ) : (
                      <Input
                        className="h-8"
                        value={cell.text}
                        disabled={disabled}
                        placeholder="Preencher"
                        maxLength={TABLE_MAX_CELL}
                        onChange={(event) =>
                          updateCell(row.id, cell.columnId, event.target.value)
                        }
                      />
                    )}
                  </td>
                ))}
                {!disabled ? (
                  <td className="border-t p-1 align-top">
                    {row.extra ? (
                      <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Remover linha"
                        onClick={() =>
                          commit({
                            ...answer,
                            rows: answer.rows.filter((item) => item.id !== row.id),
                          })
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {disabled ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAddRow}
            onClick={() =>
              commit({
                ...answer,
                rows: [...answer.rows, { id: createTableId("row"), cells: {} }],
              })
            }
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Adicionar linha
          </Button>
          <Input
            className="h-9 w-40"
            value={columnName}
            maxLength={TABLE_MAX_LABEL}
            placeholder="Nome da coluna"
            aria-label="Nome da nova coluna"
            disabled={!canAddColumn}
            onChange={(event) => setColumnName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addColumn();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAddColumn}
            onClick={addColumn}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Adicionar coluna
          </Button>
        </div>
      )}
    </div>
  );
}
