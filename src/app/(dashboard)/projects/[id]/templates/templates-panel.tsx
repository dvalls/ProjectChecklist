"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteTemplate } from "@/app/(dashboard)/templates/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ClDiscipline, ClFormTemplate } from "@/lib/supabase/types";

import { reorderProjectTemplates, swapDisciplinePositions } from "../actions";

interface TemplateWithDiscipline extends ClFormTemplate {
  cl_disciplines?: { name: string; color: string } | null;
}

interface Props {
  projectId: string;
  initialTemplates: TemplateWithDiscipline[];
  initialDisciplines: ClDiscipline[];
}

interface Group {
  discipline: ClDiscipline | null;
  templates: TemplateWithDiscipline[];
}

function buildGroups(
  templates: TemplateWithDiscipline[],
  disciplines: ClDiscipline[],
): Group[] {
  const sorted = [...disciplines].sort((a, b) => a.position - b.position);

  const groups: Group[] = sorted
    .map((d) => ({
      discipline: d,
      templates: templates
        .filter((t) => t.discipline_id === d.id)
        .sort((a, b) => a.position - b.position),
    }))
    .filter((g) => g.templates.length > 0);

  const noDiscipline = templates
    .filter((t) => t.discipline_id === null)
    .sort((a, b) => a.position - b.position);

  if (noDiscipline.length > 0) {
    groups.push({ discipline: null, templates: noDiscipline });
  }

  return groups;
}

export function TemplatesPanel({
  projectId,
  initialTemplates,
  initialDisciplines,
}: Props) {
  const [disciplines, setDisciplines] = useState(initialDisciplines);
  const [templates, setTemplates] = useState(initialTemplates);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const groups = buildGroups(templates, disciplines);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function moveTemplate(
    groupTemplates: TemplateWithDiscipline[],
    index: number,
    delta: number,
  ) {
    const next = [...groupTemplates];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];

    const positionMap = new Map(next.map((t, i) => [t.id, i]));
    setTemplates((prev) =>
      prev.map((t) => {
        const newPos = positionMap.get(t.id);
        return newPos !== undefined ? { ...t, position: newPos } : t;
      }),
    );

    startTransition(async () => {
      const res = await reorderProjectTemplates(
        projectId,
        next.map((t) => t.id),
      );
      if (res.error) toast.error(res.error);
    });
  }

  async function handleDelete(template: TemplateWithDiscipline) {
    const res = await deleteTemplate(template.id, projectId);
    if (res?.error) {
      toast.error(res.error);
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== template.id));
    toast.success("Formulário apagado.");
  }

  function moveDiscipline(groupIndex: number, delta: number) {
    const target = groupIndex + delta;
    if (target < 0 || target >= groups.length) return;

    const d1 = groups[groupIndex].discipline;
    const d2 = groups[target].discipline;
    if (!d1 || !d2) return;

    setDisciplines((prev) =>
      prev.map((d) => {
        if (d.id === d1.id) return { ...d, position: d2.position };
        if (d.id === d2.id) return { ...d, position: d1.position };
        return d;
      }),
    );

    startTransition(async () => {
      const res = await swapDisciplinePositions(d1.id, d2.id);
      if (res.error) {
        toast.error(res.error);
        setDisciplines((prev) =>
          prev.map((d) => {
            if (d.id === d1.id) return { ...d, position: d1.position };
            if (d.id === d2.id) return { ...d, position: d2.position };
            return d;
          }),
        );
      }
    });
  }

  if (groups.length === 0) return null;

  return (
    <div className="space-y-5">
      {groups.map((group, groupIndex) => {
        const groupKey = group.discipline?.id ?? "no-discipline";
        const isCollapsed = collapsedGroups.has(groupKey);
        const canUp = groupIndex > 0 && group.discipline !== null;
        const canDown = groupIndex < groups.length - 1 && group.discipline !== null;
        const groupLabel = group.discipline?.name ?? "Sem disciplina";

        return (
          <div key={groupKey}>
            <div className="mb-2 flex items-center gap-1.5">
              <div className="flex shrink-0 flex-col">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 text-muted-foreground"
                  disabled={isPending || !canUp}
                  onClick={() => moveDiscipline(groupIndex, -1)}
                  aria-label="Mover disciplina para cima"
                >
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 text-muted-foreground"
                  disabled={isPending || !canDown}
                  onClick={() => moveDiscipline(groupIndex, 1)}
                  aria-label="Mover disciplina para baixo"
                >
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>

              <button
                type="button"
                onClick={() => toggleGroup(groupKey)}
                className="flex min-w-0 items-center gap-1.5 rounded-md py-0.5 pr-1 text-left hover:bg-muted/60"
                aria-expanded={!isCollapsed}
                aria-label={
                  isCollapsed ? `Expandir ${groupLabel}` : `Recolher ${groupLabel}`
                }
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                {group.discipline ? (
                  <Badge
                    variant="outline"
                    className="text-xs font-semibold"
                    style={{
                      borderColor: group.discipline.color,
                      color: group.discipline.color,
                    }}
                  >
                    {group.discipline.name}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs font-semibold">
                    Sem disciplina
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  ({group.templates.length})
                </span>
              </button>
            </div>

            {!isCollapsed ? (
              <div className="ml-6 space-y-2">
                {group.templates.map((t, ti) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border bg-card p-3 transition-colors hover:border-primary/30"
                  >
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={isPending || ti === 0}
                        onClick={() => moveTemplate(group.templates, ti, -1)}
                        aria-label="Mover para cima"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        disabled={isPending || ti === group.templates.length - 1}
                        onClick={() => moveTemplate(group.templates, ti, 1)}
                        aria-label="Mover para baixo"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <Link href={`/templates/${t.id}`} className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{t.name}</div>
                      {t.description ? (
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      ) : null}
                    </Link>

                    <ConfirmDialog
                      destructive
                      title={`Apagar "${t.name}"?`}
                      description="Esta ação é permanente. Campos e seções deste formulário serão removidos."
                      confirmLabel="Apagar"
                      onConfirm={() => handleDelete(t)}
                      trigger={
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                          disabled={isPending}
                          aria-label={`Apagar ${t.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
