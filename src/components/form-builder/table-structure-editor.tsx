"use client";

import { Lock, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TABLE_MAX_COLUMNS,
  TABLE_MAX_LABEL,
  TABLE_MAX_ROWS,
  createTableId,
  parseTableDefinition,
  type TableDefinition,
} from "@/lib/forms/table";
import type { FieldOptions } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export function TableStructureEditor({
  options,
  onChange,
}: {
  options: FieldOptions;
  onChange: (next: TableDefinition) => void;
}) {
  const definition = parseTableDefinition(options);
  const columns = definition.columns;
  const rows = definition.rows;
  const canAddColumn = columns.length < TABLE_MAX_COLUMNS;
  const canAddRow = rows.length < TABLE_MAX_ROWS;

  function commit(next: TableDefinition) {
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Texto trava a célula. Vazio fica livre para quem responde. Dá para incluir linhas
        e colunas aqui e também na hora de preencher.
      </p>
      <div className="overflow-x-auto rounded-md border bg-background">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40">
              {columns.map((column) => (
                <th key={column.id} className="min-w-36 border-b p-1.5 text-left">
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-8"
                      value={column.label}
                      maxLength={TABLE_MAX_LABEL}
                      aria-label="Nome da coluna"
                      onChange={(event) =>
                        commit({
                          ...definition,
                          columns: columns.map((item) =>
                            item.id === column.id
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                      aria-label="Remover coluna"
                      disabled={columns.length <= 1}
                      onClick={() =>
                        commit({
                          columns: columns.filter((item) => item.id !== column.id),
                          rows: rows.map((row) => {
                            const cells = { ...row.cells };
                            delete cells[column.id];
                            return { ...row, cells };
                          }),
                        })
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="w-8 border-b" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => {
                  const text = row.cells[column.id] ?? "";
                  const locked = text.trim() !== "";
                  return (
                    <td key={column.id} className="border-t p-1.5 align-top">
                      <div className="relative">
                        <Input
                          className={cn("h-8", locked && "pr-7")}
                          value={text}
                          placeholder="Livre"
                          aria-label={locked ? "Célula travada" : "Célula livre"}
                          onChange={(event) =>
                            commit({
                              ...definition,
                              rows: rows.map((item) =>
                                item.id === row.id
                                  ? {
                                      ...item,
                                      cells: {
                                        ...item.cells,
                                        [column.id]: event.target.value,
                                      },
                                    }
                                  : item,
                              ),
                            })
                          }
                        />
                        {locked ? (
                          <Lock className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        ) : null}
                      </div>
                    </td>
                  );
                })}
                <td className="border-t p-1 align-top">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    aria-label="Remover linha"
                    disabled={rows.length <= 1}
                    onClick={() =>
                      commit({
                        ...definition,
                        rows: rows.filter((item) => item.id !== row.id),
                      })
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canAddRow}
          onClick={() =>
            commit({
              ...definition,
              rows: [...rows, { id: createTableId("row"), cells: {} }],
            })
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar linha
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canAddColumn}
          onClick={() =>
            commit({
              columns: [
                ...columns,
                {
                  id: createTableId("col"),
                  label: `Coluna ${columns.length + 1}`,
                },
              ],
              rows,
            })
          }
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar coluna
        </Button>
      </div>
    </div>
  );
}
