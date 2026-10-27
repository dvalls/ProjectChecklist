"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Lock, Plus, X } from "lucide-react";

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

function ColumnHeader({
  id,
  label,
  canDrag,
  canRemove,
  onRename,
  onRemove,
}: {
  id: string;
  label: string;
  canDrag: boolean;
  canRemove: boolean;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !canDrag });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 2 : undefined,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className="min-w-40 border-b bg-muted/40 p-1.5 text-left"
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
          aria-label="Reordenar coluna"
          disabled={!canDrag}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <Input
          className="h-8"
          value={label}
          maxLength={TABLE_MAX_LABEL}
          aria-label="Nome da coluna"
          onChange={(event) => onRename(event.target.value)}
        />
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
          aria-label="Remover coluna"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </th>
  );
}

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function commit(next: TableDefinition) {
    onChange(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = columns.findIndex((column) => column.id === active.id);
    const newIndex = columns.findIndex((column) => column.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    commit({ ...definition, columns: arrayMove(columns, oldIndex, newIndex) });
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Texto trava a célula. Vazio fica livre para quem responde. Dá para incluir linhas
        e colunas aqui e também na hora de preencher.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full border-collapse text-sm">
            <thead>
              <SortableContext
                items={columns.map((column) => column.id)}
                strategy={horizontalListSortingStrategy}
              >
                <tr>
                  {columns.map((column) => (
                    <ColumnHeader
                      key={column.id}
                      id={column.id}
                      label={column.label}
                      canDrag={columns.length > 1}
                      canRemove={columns.length > 1}
                      onRename={(label) =>
                        commit({
                          ...definition,
                          columns: columns.map((item) =>
                            item.id === column.id ? { ...item, label } : item,
                          ),
                        })
                      }
                      onRemove={() =>
                        commit({
                          columns: columns.filter((item) => item.id !== column.id),
                          rows: rows.map((row) => {
                            const cells = { ...row.cells };
                            delete cells[column.id];
                            return { ...row, cells };
                          }),
                        })
                      }
                    />
                  ))}
                  <th className="w-8 border-b bg-muted/40" />
                </tr>
              </SortableContext>
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
      </DndContext>
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
