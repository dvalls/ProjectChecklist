"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteTemplate } from "@/app/(dashboard)/templates/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  relocateInGroup,
  reorderInGroup,
  reorderSubsetSlots,
} from "@/lib/forms/reorder-groups";
import type { ClDiscipline, ClFormTemplate } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { reorderDisciplines, syncProjectTemplateGroups } from "../actions";

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

const animateLayoutChanges: AnimateLayoutChanges = (args) =>
  defaultAnimateLayoutChanges({ ...args, wasDragging: true });

const NO_DISCIPLINE = "no-discipline";

function groupKey(group: Group) {
  return group.discipline?.id ?? NO_DISCIPLINE;
}

function disciplineIdFromKey(key: string): string | null {
  return key === NO_DISCIPLINE ? null : key;
}

function buildGroups(
  templates: TemplateWithDiscipline[],
  disciplines: ClDiscipline[],
): Group[] {
  const sorted = [...disciplines].sort((a, b) => a.position - b.position);

  const groups: Group[] = sorted
    .map((discipline) => ({
      discipline,
      templates: templates
        .filter((template) => template.discipline_id === discipline.id)
        .sort((a, b) => a.position - b.position),
    }))
    .filter((group) => group.templates.length > 0);

  const noDiscipline = templates
    .filter((template) => template.discipline_id === null)
    .sort((a, b) => a.position - b.position);

  if (noDiscipline.length > 0) {
    groups.push({ discipline: null, templates: noDiscipline });
  }

  return groups;
}

function withPinnedGroups(
  groups: Group[],
  pinned: string[] | null,
  disciplines: ClDiscipline[],
): Group[] {
  if (!pinned) return groups;
  const byKey = new Map(groups.map((group) => [groupKey(group), group]));
  const disciplineById = new Map(
    disciplines.map((discipline) => [discipline.id, discipline]),
  );
  const shown: Group[] = [];

  for (const key of pinned) {
    const existing = byKey.get(key);
    if (existing) {
      shown.push(existing);
      continue;
    }
    if (key === NO_DISCIPLINE) {
      shown.push({ discipline: null, templates: [] });
      continue;
    }
    const discipline = disciplineById.get(key);
    if (discipline) shown.push({ discipline, templates: [] });
  }

  for (const group of groups) {
    if (!pinned.includes(groupKey(group))) shown.push(group);
  }

  return shown;
}

function withPositions(templates: TemplateWithDiscipline[]): TemplateWithDiscipline[] {
  const counts = new Map<string, number>();
  return templates.map((template) => {
    const key = template.discipline_id ?? "none";
    const position = counts.get(key) ?? 0;
    counts.set(key, position + 1);
    return template.position === position ? template : { ...template, position };
  });
}

function layoutKey(templates: TemplateWithDiscipline[], disciplines: ClDiscipline[]) {
  return buildGroups(templates, disciplines)
    .map(
      (group) =>
        `${group.discipline?.id ?? ""}:${group.templates.map((template) => template.id).join(",")}`,
    )
    .join("|");
}

function setTemplateGroup(
  template: TemplateWithDiscipline,
  groupId: string | null,
  disciplines: ClDiscipline[],
): TemplateWithDiscipline {
  const discipline = groupId ? disciplines.find((item) => item.id === groupId) : null;
  return {
    ...template,
    discipline_id: groupId,
    cl_disciplines: discipline
      ? { name: discipline.name, color: discipline.color }
      : null,
  };
}

export function TemplatesPanel({
  projectId,
  initialTemplates,
  initialDisciplines,
}: Props) {
  const [disciplines, setDisciplines] = useState(initialDisciplines);
  const [templates, setTemplates] = useState(initialTemplates);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [pinnedKeys, setPinnedKeys] = useState<string[] | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const templatesRef = useRef(templates);
  const disciplinesRef = useRef(disciplines);
  const snapshotRef = useRef<{
    templates: TemplateWithDiscipline[];
    disciplines: ClDiscipline[];
  } | null>(null);
  const lastOverId = useRef<string | null>(null);
  const recentlyMoved = useRef(false);
  templatesRef.current = templates;
  disciplinesRef.current = disciplines;

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMoved.current = false;
    });
  }, [templates]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const groups = buildGroups(templates, disciplines);
  const shownGroups = withPinnedGroups(groups, pinnedKeys, disciplines);
  const activeTemplate =
    templates.find((template) => template.id === activeTemplateId) ?? null;

  function commitTemplates(next: TemplateWithDiscipline[]) {
    const positioned = withPositions(next);
    templatesRef.current = positioned;
    setTemplates(positioned);
    return positioned;
  }

  function restoreSnapshot() {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    templatesRef.current = snapshot.templates;
    disciplinesRef.current = snapshot.disciplines;
    setTemplates(snapshot.templates);
    setDisciplines(snapshot.disciplines);
  }

  const collisionDetection: CollisionDetection = (args) => {
    if (args.active.data.current?.type === "discipline") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (container) => container.data.current?.type === "discipline",
        ),
      });
    }

    const templateIds = new Set(
      templatesRef.current.map((template) => `tpl:${template.id}`),
    );
    const candidates = args.droppableContainers.filter((container) => {
      const id = String(container.id);
      return templateIds.has(id) || container.data.current?.type === "discipline-drop";
    });
    const narrowed = { ...args, droppableContainers: candidates };
    const pointerHits = pointerWithin(narrowed);
    const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(narrowed);
    const templateHit = hits.find((hit) => templateIds.has(String(hit.id)));
    if (templateHit) {
      lastOverId.current = String(templateHit.id);
      return [templateHit];
    }

    const dropHit = hits.find((hit) => String(hit.id).startsWith("disc-drop:"));
    if (dropHit) {
      const key = String(dropHit.id).slice("disc-drop:".length);
      const disciplineId = disciplineIdFromKey(key);
      const inGroup = templatesRef.current.filter(
        (template) => template.discipline_id === disciplineId,
      );
      if (inGroup.length > 0) {
        const closest = closestCenter({
          ...narrowed,
          droppableContainers: candidates.filter((container) =>
            inGroup.some((template) => `tpl:${template.id}` === String(container.id)),
          ),
        });
        if (closest[0]) {
          lastOverId.current = String(closest[0].id);
          return closest;
        }
      }
      lastOverId.current = String(dropHit.id);
      return [dropHit];
    }

    if (recentlyMoved.current) lastOverId.current = String(args.active.id);
    return lastOverId.current ? [{ id: lastOverId.current }] : closestCenter(narrowed);
  };

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resolveTemplateTarget(overId: string) {
    if (overId.startsWith("tpl:")) {
      const templateId = overId.slice(4);
      const template = templatesRef.current.find((item) => item.id === templateId);
      if (!template) return null;
      return { disciplineId: template.discipline_id, overTemplateId: templateId };
    }
    if (overId.startsWith("disc-drop:")) {
      return {
        disciplineId: disciplineIdFromKey(overId.slice("disc-drop:".length)),
        overTemplateId: null as string | null,
      };
    }
    return null;
  }

  function moveTemplate(activeId: string, overId: string, placeAfter: boolean) {
    const templateId = activeId.startsWith("tpl:") ? activeId.slice(4) : activeId;
    const target = resolveTemplateTarget(overId);
    const active = templatesRef.current.find((item) => item.id === templateId);
    if (!target || !active || active.discipline_id === target.disciplineId) return null;

    const next = relocateInGroup(
      templatesRef.current,
      templateId,
      target.disciplineId,
      target.overTemplateId,
      placeAfter,
      (item) => item.id,
      (item) => item.discipline_id,
      (item, groupId) => setTemplateGroup(item, groupId, disciplinesRef.current),
    );
    if (next === templatesRef.current) return null;
    recentlyMoved.current = true;
    return commitTemplates(next);
  }

  function handleDragStart(event: DragStartEvent) {
    snapshotRef.current = {
      templates: templatesRef.current,
      disciplines: disciplinesRef.current,
    };
    lastOverId.current = null;
    if (event.active.data.current?.type === "template") {
      const templateId = String(event.active.id).slice(4);
      setActiveTemplateId(templateId);
      setPinnedKeys(
        buildGroups(templatesRef.current, disciplinesRef.current).map(groupKey),
      );
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.data.current?.type !== "template") return;
    const overId = String(over.id);
    const activeTemplate = templatesRef.current.find(
      (item) => item.id === String(active.id).slice(4),
    );
    const target = resolveTemplateTarget(overId);
    const translated = active.rect.current.translated;
    const placeAfter = Boolean(
      target?.overTemplateId &&
      translated &&
      translated.top > over.rect.top + over.rect.height,
    );
    const moved = moveTemplate(String(active.id), overId, placeAfter);
    if (!moved || !target || !activeTemplate) return;
    if (collapsedGroups.has(target.disciplineId ?? NO_DISCIPLINE)) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        next.delete(target.disciplineId ?? NO_DISCIPLINE);
        return next;
      });
    }
  }

  function finishDrag() {
    setActiveTemplateId(null);
    setPinnedKeys(null);
    lastOverId.current = null;
  }

  function handleDragCancel() {
    restoreSnapshot();
    finishDrag();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const snapshot = snapshotRef.current;
    finishDrag();
    if (!over || !snapshot) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (active.data.current?.type === "discipline") {
      const activeDisciplineId = activeId.startsWith("disc:") ? activeId.slice(5) : "";
      const overDisciplineId = overId.startsWith("disc:") ? overId.slice(5) : "";
      if (
        !activeDisciplineId ||
        !overDisciplineId ||
        activeDisciplineId === overDisciplineId
      ) {
        return;
      }

      const sorted = [...disciplinesRef.current].sort((a, b) => a.position - b.position);
      const visibleIds = buildGroups(templatesRef.current, sorted)
        .map((group) => group.discipline?.id)
        .filter((id): id is string => Boolean(id));
      const oldIndex = visibleIds.indexOf(activeDisciplineId);
      const newIndex = visibleIds.indexOf(overDisciplineId);
      if (oldIndex < 0 || newIndex < 0) return;

      const nextVisible = [...visibleIds];
      const [removed] = nextVisible.splice(oldIndex, 1);
      nextVisible.splice(newIndex, 0, removed);
      const nextIds = reorderSubsetSlots(
        sorted.map((discipline) => discipline.id),
        nextVisible,
      );
      const byId = new Map(
        disciplinesRef.current.map((discipline) => [discipline.id, discipline]),
      );
      const nextDisciplines = nextIds.map((id, position) => {
        const discipline = byId.get(id);
        if (!discipline) return null;
        return discipline.position === position
          ? discipline
          : { ...discipline, position };
      });
      if (nextDisciplines.some((discipline) => !discipline)) return;
      const typed = nextDisciplines as ClDiscipline[];
      disciplinesRef.current = typed;
      setDisciplines(typed);

      startTransition(async () => {
        const result = await reorderDisciplines(nextIds);
        if (result.error) {
          toast.error(result.error);
          disciplinesRef.current = snapshot.disciplines;
          setDisciplines(snapshot.disciplines);
        }
      });
      return;
    }

    if (active.data.current?.type !== "template" || activeId === overId) {
      const unchanged =
        layoutKey(templatesRef.current, disciplinesRef.current) ===
        layoutKey(snapshot.templates, snapshot.disciplines);
      if (unchanged) return;
    }

    const templateId = activeId.slice(4);
    const target = resolveTemplateTarget(overId);
    let next = templatesRef.current;
    if (target?.overTemplateId && target.disciplineId !== undefined) {
      const current = next.find((item) => item.id === templateId);
      if (current && current.discipline_id === target.disciplineId) {
        next = reorderInGroup(
          next,
          current.discipline_id,
          templateId,
          target.overTemplateId,
          (item) => item.id,
          (item) => item.discipline_id,
        );
        next = commitTemplates(next);
      } else {
        const moved = moveTemplate(activeId, overId, false);
        if (moved) next = moved;
      }
    } else if (target) {
      const moved = moveTemplate(activeId, overId, false);
      if (moved) next = moved;
    }

    if (
      layoutKey(next, disciplinesRef.current) ===
      layoutKey(snapshot.templates, snapshot.disciplines)
    ) {
      return;
    }

    startTransition(async () => {
      const result = await syncProjectTemplateGroups(
        projectId,
        buildGroups(next, disciplinesRef.current).map((group) => ({
          disciplineId: group.discipline?.id ?? null,
          templateIds: group.templates.map((template) => template.id),
        })),
      );
      if (result.error) {
        toast.error(result.error);
        templatesRef.current = snapshot.templates;
        setTemplates(snapshot.templates);
      }
    });
  }

  async function handleDelete(template: TemplateWithDiscipline) {
    const result = await deleteTemplate(template.id, projectId);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    const next = templates.filter((item) => item.id !== template.id);
    templatesRef.current = next;
    setTemplates(next);
    toast.success("Formulário apagado.");
  }

  if (shownGroups.length === 0) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={shownGroups
          .filter((group) => group.discipline)
          .map((group) => `disc:${group.discipline?.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-5">
          {shownGroups.map((group) => (
            <DisciplineGroup
              key={groupKey(group)}
              group={group}
              collapsed={collapsedGroups.has(groupKey(group))}
              disabled={isPending}
              onToggle={() => toggleGroup(groupKey(group))}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeTemplate ? <TemplatePreview template={activeTemplate} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function DisciplineGroup({
  group,
  collapsed,
  disabled,
  onToggle,
  onDelete,
}: {
  group: Group;
  collapsed: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDelete: (template: TemplateWithDiscipline) => void;
}) {
  const key = groupKey(group);
  const discipline = group.discipline;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: discipline ? `disc:${discipline.id}` : "disc:no-discipline",
      disabled: !discipline || disabled,
      data: discipline
        ? { type: "discipline", disciplineId: discipline.id }
        : { type: "static" },
    });
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `disc-drop:${key}`,
    data: { type: "discipline-drop", disciplineId: discipline?.id ?? null },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div ref={setDropRef} className={cn(isOver && "rounded-md bg-muted/50")}>
        <div className="mb-2 flex items-center gap-1.5">
          {discipline ? (
            <button
              type="button"
              className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
              aria-label={`Arrastar ${discipline.name}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          ) : (
            <span className="h-7 w-7 shrink-0" />
          )}

          <button
            type="button"
            onClick={onToggle}
            className="flex min-w-0 items-center gap-1.5 rounded-md py-0.5 pr-1 text-left hover:bg-muted/60"
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? `Expandir ${discipline?.name ?? "Sem disciplina"}`
                : `Recolher ${discipline?.name ?? "Sem disciplina"}`
            }
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            {discipline ? (
              <Badge
                variant="outline"
                className="text-xs font-semibold"
                style={{ borderColor: discipline.color, color: discipline.color }}
              >
                {discipline.name}
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

        {!collapsed ? (
          <div className="ml-6 space-y-2">
            <SortableContext
              items={group.templates.map((template) => `tpl:${template.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {group.templates.map((template) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  disabled={disabled}
                  onDelete={() => onDelete(template)}
                />
              ))}
            </SortableContext>
            {group.templates.length === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                Solte o formulário aqui
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TemplateRow({
  template,
  disabled,
  onDelete,
}: {
  template: TemplateWithDiscipline;
  disabled: boolean;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: `tpl:${template.id}`,
      disabled,
      data: { type: "template", templateId: template.id },
      animateLayoutChanges,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-card p-3 transition-colors hover:border-primary/30"
    >
      <button
        type="button"
        className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
        aria-label={`Arrastar ${template.name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Link href={`/templates/${template.id}`} className="min-w-0 flex-1">
        <div className="text-sm font-medium">{template.name}</div>
        {template.description ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {template.description}
          </p>
        ) : null}
      </Link>

      <ConfirmDialog
        destructive
        title={`Apagar "${template.name}"?`}
        description="Esta ação é permanente. Campos e seções deste formulário serão removidos."
        confirmLabel="Apagar"
        onConfirm={onDelete}
        trigger={
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
            disabled={disabled}
            aria-label={`Apagar ${template.name}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        }
      />
    </div>
  );
}

function TemplatePreview({ template }: { template: TemplateWithDiscipline }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card p-3 shadow-lg">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <div className="text-sm font-medium">{template.name}</div>
        {template.description ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {template.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
