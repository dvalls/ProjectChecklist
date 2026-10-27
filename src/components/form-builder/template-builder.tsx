"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import {
  DndContext,
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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { relocateInGroup, reorderInGroup } from "@/lib/forms/reorder-groups";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type {
  ClFormField,
  ClFormSection,
  ClFormTemplate,
  ColumnSpan,
  FieldOptions,
  FieldType,
  LayoutMode,
  SectionColumns,
  VisibleWhen,
} from "@/lib/supabase/types";

import {
  deleteTemplate,
  renameTemplate,
  saveAsTemplate,
  saveTemplate,
  type FieldInput as FieldInputPayload,
  type SectionInput,
  type TemplateSavePayload,
} from "@/app/(dashboard)/templates/[id]/actions";

import type { FieldValue } from "@/lib/forms/types";
import { createDefaultTable } from "@/lib/forms/table";
import { evaluateVisible, isDisplayOnly, makeFieldKey } from "@/lib/forms/utils";

import { FieldInputControl } from "./field-input";
import { FieldAccordionItem } from "./field-accordion-item";
import { ColumnsPicker, FIELD_TYPE_ORDER, TYPE_META } from "./shared";

export interface EditorSection {
  local_id: string;
  id?: string;
  title: string;
  subtitle: string | null;
  columns: SectionColumns;
}

type EditorFocus = { kind: "section" | "field"; id: string };

export interface EditorField {
  localId: string;
  id?: string;
  section_local_id: string | null;
  group_key: string | null;
  label: string;
  help_text: string | null;
  type: FieldType;
  required: boolean;
  column_span: ColumnSpan;
  options: FieldOptions;
  visible_when: VisibleWhen | null;
}

function newLocalId(prefix = "new") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const SECTION_DROP_PREFIX = "section-drop:";

const fieldOrder = {
  idOf: (field: EditorField) => field.localId,
  groupOf: (field: EditorField) => field.section_local_id,
  setGroup: (field: EditorField, groupId: string | null) => ({
    ...field,
    section_local_id: groupId,
  }),
};

function sectionIdFromDrop(id: string): string | null {
  return id.startsWith(SECTION_DROP_PREFIX) ? id.slice(SECTION_DROP_PREFIX.length) : null;
}

function sectionsFromInitial(sections: ClFormSection[]): EditorSection[] {
  if (sections.length > 0) {
    return sections.map((s) => ({
      local_id: s.id,
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      columns: s.columns,
    }));
  }
  return [
    {
      local_id: newLocalId("sec"),
      title: "Geral",
      subtitle: null,
      columns: 3,
    },
  ];
}

function fieldsFromInitial(
  fields: ClFormField[],
  sectionLookup: Map<string, string>,
  defaultSectionLocalId: string,
): EditorField[] {
  return fields.map((f) => ({
    localId: f.id,
    id: f.id,
    section_local_id: f.section_id
      ? (sectionLookup.get(f.section_id) ?? defaultSectionLocalId)
      : defaultSectionLocalId,
    group_key: f.group_key,
    label: f.label,
    help_text: f.help_text,
    type: f.type,
    required: f.required,
    column_span: f.column_span,
    options: f.options,
    visible_when: f.visible_when,
  }));
}

function SortableSectionShell({
  id,
  highlighted,
  children,
}: {
  id: string;
  highlighted?: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 10 : undefined,
  };

  const dragHandle = (
    <button
      type="button"
      className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing"
      aria-label="Arrastar seção"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div
      id={`section-${id}`}
      ref={setNodeRef}
      style={style}
      className={cn(
        "scroll-mt-32 overflow-hidden rounded-lg border bg-background transition-colors",
        highlighted && "border-primary ring-2 ring-primary/40",
      )}
    >
      {children(dragHandle)}
    </div>
  );
}

function SectionDropZone({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `${SECTION_DROP_PREFIX}${id}` });
  return <div ref={setNodeRef}>{children}</div>;
}

function defaultOptionsFor(type: FieldType): FieldOptions {
  if (type === "select" || type === "radio") {
    return { choices: [] };
  }
  if (type === "checkbox_group") {
    return { choices: [], allow_other: false };
  }
  if (type === "info") {
    return { content: "" };
  }
  if (type === "image") {
    return { image_url: null, image_caption: null, image_link: null };
  }
  if (type === "table") {
    return createDefaultTable();
  }
  return null;
}

export function TemplateBuilder({
  template,
  initialSections,
  initialFields,
}: {
  template: ClFormTemplate;
  initialSections: ClFormSection[];
  initialFields: ClFormField[];
}) {
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(
    template.layout_mode ?? "standard",
  );
  const [environments, setEnvironments] = useState<string[]>(template.environments ?? []);

  const [sections, setSections] = useState<EditorSection[]>(() =>
    sectionsFromInitial(initialSections),
  );

  const [fields, setFields] = useState<EditorField[]>(() => {
    const sectionLookup = new Map<string, string>(
      initialSections.map((s) => [s.id, s.id]),
    );
    const defaultSection = sections[0]?.local_id ?? newLocalId("sec");
    return fieldsFromInitial(initialFields, sectionLookup, defaultSection);
  });

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [expandedFieldLocalId, setExpandedFieldLocalId] = useState<string | null>(null);
  const [editorFocus, setEditorFocus] = useState<EditorFocus | null>(null);
  const [editorFocusSerial, setEditorFocusSerial] = useState(0);
  const editorFocusRef = useRef<EditorFocus | null>(null);
  const [justCreatedLocalId, setJustCreatedLocalId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [isSaving, startSaving] = useTransition();
  const [isRenaming, startRenaming] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [isSavingAsTemplate, startSavingAsTemplate] = useTransition();

  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sectionsRef = useRef(sections);
  const fieldsRef = useRef(fields);
  const fieldsSnapshot = useRef<EditorField[] | null>(null);
  const lastOverId = useRef<string | null>(null);
  const recentlyMovedToNewContainer = useRef(false);
  sectionsRef.current = sections;
  fieldsRef.current = fields;

  useEffect(() => {
    requestAnimationFrame(() => {
      recentlyMovedToNewContainer.current = false;
    });
  }, [fields]);

  function commitFields(next: EditorField[]) {
    fieldsRef.current = next;
    setFields(next);
  }

  const collisionDetection: CollisionDetection = (args) => {
    const activeId = String(args.active.id);
    const sectionIds = new Set(sectionsRef.current.map((s) => s.local_id));

    if (sectionIds.has(activeId)) {
      const pointerY = args.pointerCoordinates?.y ?? args.collisionRect.top;
      const collisions = args.droppableContainers.flatMap((container) => {
        if (!sectionIds.has(String(container.id))) return [];
        const rect = args.droppableRects.get(container.id);
        if (!rect) return [];
        const midY = rect.top + rect.height / 2;
        return [
          {
            id: container.id,
            data: { droppableContainer: container, value: Math.abs(pointerY - midY) },
          },
        ];
      });
      collisions.sort((a, b) => a.data.value - b.data.value);
      return collisions;
    }

    const fieldIds = new Set(fieldsRef.current.map((field) => field.localId));
    const candidates = args.droppableContainers.filter((container) => {
      const id = String(container.id);
      return fieldIds.has(id) || id.startsWith(SECTION_DROP_PREFIX);
    });
    const narrowed = { ...args, droppableContainers: candidates };
    const pointerHits = pointerWithin(narrowed);
    const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(narrowed);
    const fieldHit = hits.find((hit) => fieldIds.has(String(hit.id)));
    if (fieldHit) {
      lastOverId.current = String(fieldHit.id);
      return [fieldHit];
    }

    const dropHit = hits.find((hit) => String(hit.id).startsWith(SECTION_DROP_PREFIX));
    if (dropHit) {
      const sectionId = sectionIdFromDrop(String(dropHit.id));
      const sectionFields = fieldsRef.current.filter(
        (field) => field.section_local_id === sectionId,
      );
      if (sectionId && sectionFields.length > 0) {
        const closest = closestCenter({
          ...narrowed,
          droppableContainers: candidates.filter((container) =>
            sectionFields.some((field) => field.localId === String(container.id)),
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

    if (recentlyMovedToNewContainer.current) lastOverId.current = activeId;
    return lastOverId.current ? [{ id: lastOverId.current }] : closestCenter(narrowed);
  };

  function toggleField(localId: string) {
    setExpandedFieldLocalId((prev) => (prev === localId ? null : localId));
    setJustCreatedLocalId(null);
  }

  function revealInEditor(next: EditorFocus) {
    if (next.kind === "field") {
      const field = fieldsRef.current.find((item) => item.localId === next.id);
      if (!field) return;
      const sectionId = field.section_local_id;
      if (sectionId) {
        setCollapsedSections((prev) => {
          if (!prev.has(sectionId)) return prev;
          const copy = new Set(prev);
          copy.delete(sectionId);
          return copy;
        });
      }
      setExpandedFieldLocalId(next.id);
    } else {
      setCollapsedSections((prev) => {
        if (!prev.has(next.id)) return prev;
        const copy = new Set(prev);
        copy.delete(next.id);
        return copy;
      });
    }
    editorFocusRef.current = next;
    setEditorFocus(next);
    setEditorFocusSerial((n) => n + 1);
  }

  useEffect(() => {
    const focus = editorFocusRef.current;
    if (!focus) return;
    const elementId =
      focus.kind === "field" ? `field-head-${focus.id}` : `section-${focus.id}`;
    const frame = requestAnimationFrame(() => {
      document.getElementById(elementId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    const timer = window.setTimeout(() => setEditorFocus(null), 1800);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [editorFocusSerial]);

  function toggleSection(localId: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
  }

  function addSection() {
    const newSection: EditorSection = {
      local_id: newLocalId("sec"),
      title: "Nova seção",
      subtitle: null,
      columns: 3,
    };
    setSections((prev) => [...prev, newSection]);
  }

  function updateSection(localId: string, updater: (s: EditorSection) => EditorSection) {
    setSections((prev) => prev.map((s) => (s.local_id === localId ? updater(s) : s)));
  }

  function deleteSection(localId: string) {
    setSections((prev) => {
      if (prev.length <= 1) {
        toast.error("Mantenha pelo menos uma seção.");
        return prev;
      }
      return prev.filter((s) => s.local_id !== localId);
    });
    setFields((prev) =>
      prev.map((f) =>
        f.section_local_id === localId
          ? { ...f, section_local_id: sections[0]?.local_id ?? null }
          : f,
      ),
    );
  }

  function addField(sectionLocalId: string, type: FieldType = "text") {
    const localId = newLocalId();
    setFields((prev) => [
      ...prev,
      {
        localId,
        section_local_id: sectionLocalId,
        group_key: null,
        label: "",
        help_text: null,
        type,
        required: false,
        column_span: type === "table" ? 4 : 1,
        options: defaultOptionsFor(type),
        visible_when: null,
      },
    ]);
    setExpandedFieldLocalId(localId);
    setJustCreatedLocalId(localId);
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.delete(sectionLocalId);
      return next;
    });
  }

  function updateField(localId: string, updater: (f: EditorField) => EditorField) {
    setFields((prev) => prev.map((f) => (f.localId === localId ? updater(f) : f)));
  }

  function deleteField(localId: string) {
    setFields((prev) => prev.filter((f) => f.localId !== localId));
    if (expandedFieldLocalId === localId) setExpandedFieldLocalId(null);
  }

  function duplicateField(localId: string) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.localId === localId);
      if (idx < 0) return prev;
      const original = prev[idx];
      const copy: EditorField = {
        ...original,
        localId: newLocalId(),
        id: undefined,
        label: original.label ? `${original.label} (cópia)` : "",
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      setExpandedFieldLocalId(copy.localId);
      setJustCreatedLocalId(null);
      return next;
    });
  }

  function moveField(localId: string, sectionLocalId: string) {
    setFields((prev) =>
      prev.map((f) =>
        f.localId === localId ? { ...f, section_local_id: sectionLocalId } : f,
      ),
    );
  }

  function targetSectionId(overId: string): string | null {
    const overField = fieldsRef.current.find((field) => field.localId === overId);
    if (overField?.section_local_id) return overField.section_local_id;
    return sectionIdFromDrop(overId);
  }

  function handleDragStart(event: DragStartEvent) {
    const activeId = String(event.active.id);
    fieldsSnapshot.current = fieldsRef.current.some((field) => field.localId === activeId)
      ? fieldsRef.current
      : null;
    lastOverId.current = null;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    if (sectionsRef.current.some((section) => section.local_id === activeId)) return;

    const activeField = fieldsRef.current.find((field) => field.localId === activeId);
    if (!activeField) return;

    const overId = String(over.id);
    const targetSection = targetSectionId(overId);
    if (!targetSection || targetSection === activeField.section_local_id) return;

    const overField = fieldsRef.current.find((field) => field.localId === overId);
    const translated = active.rect.current.translated;
    const placeAfter = Boolean(
      overField && translated && translated.top > over.rect.top + over.rect.height,
    );
    const next = relocateInGroup(
      fieldsRef.current,
      activeId,
      targetSection,
      overField?.localId ?? null,
      placeAfter,
      fieldOrder.idOf,
      fieldOrder.groupOf,
      fieldOrder.setGroup,
    );
    if (next === fieldsRef.current) return;

    recentlyMovedToNewContainer.current = true;
    commitFields(next);
    setCollapsedSections((prev) => {
      if (!prev.has(targetSection)) return prev;
      const expanded = new Set(prev);
      expanded.delete(targetSection);
      return expanded;
    });
  }

  function handleDragCancel() {
    if (fieldsSnapshot.current) commitFields(fieldsSnapshot.current);
    fieldsSnapshot.current = null;
    lastOverId.current = null;
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    fieldsSnapshot.current = null;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);
    const sectionIds = new Set(sectionsRef.current.map((section) => section.local_id));

    if (sectionIds.has(activeId)) {
      setSections((prev) => {
        const oldIndex = prev.findIndex((section) => section.local_id === activeId);
        const newIndex = prev.findIndex((section) => section.local_id === overId);
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
      return;
    }

    const activeField = fieldsRef.current.find((field) => field.localId === activeId);
    if (!activeField) return;

    const overField = fieldsRef.current.find((field) => field.localId === overId);
    const targetSection = targetSectionId(overId);
    if (targetSection && targetSection !== activeField.section_local_id) {
      const next = relocateInGroup(
        fieldsRef.current,
        activeId,
        targetSection,
        overField?.localId ?? null,
        false,
        fieldOrder.idOf,
        fieldOrder.groupOf,
        fieldOrder.setGroup,
      );
      if (next !== fieldsRef.current) commitFields(next);
      if (targetSection) {
        setCollapsedSections((prev) => {
          if (!prev.has(targetSection)) return prev;
          const expanded = new Set(prev);
          expanded.delete(targetSection);
          return expanded;
        });
      }
      return;
    }

    if (!overField || overField.section_local_id !== activeField.section_local_id) return;
    if (!activeField.section_local_id) return;

    const next = reorderInGroup(
      fieldsRef.current,
      activeField.section_local_id,
      activeId,
      overId,
      fieldOrder.idOf,
      fieldOrder.groupOf,
    );
    if (next !== fieldsRef.current) commitFields(next);
  }

  function handleSave() {
    startSaving(async () => {
      const sectionsPayload: SectionInput[] = sections.map((s, idx) => ({
        id: s.id,
        local_id: s.local_id,
        title: s.title,
        subtitle: s.subtitle,
        columns: s.columns,
        position: idx,
      }));

      let globalPos = 0;
      const fieldsPayload: FieldInputPayload[] = sections.flatMap((s) =>
        fields
          .filter((f) => f.section_local_id === s.local_id)
          .map((f) => {
            const pos = globalPos++;
            return {
              id: f.id,
              section_id: null,
              section_local_id: s.local_id,
              group_key: f.group_key,
              label: f.label,
              help_text: f.help_text,
              type: f.type,
              required: f.type === "table" ? false : f.required,
              column_span: f.column_span,
              position: pos,
              options:
                f.type === "table" && f.options
                  ? { ...f.options, image_url: null, image_caption: null }
                  : f.options,
              visible_when: f.visible_when,
              visible_when_local_id: f.localId,
            };
          }),
      );

      const payload: TemplateSavePayload = {
        name,
        description: description || null,
        layout_mode: layoutMode,
        environments: layoutMode === "matrix" ? environments : null,
        sections: sectionsPayload,
        fields: fieldsPayload,
      };

      const res = await saveTemplate(template.id, payload);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Formulário salvo.");
      }
    });
  }

  function handleRename() {
    if (!renameValue.trim()) return;
    startRenaming(async () => {
      const res = await renameTemplate(template.id, renameValue.trim());
      if (res?.error) {
        toast.error(res.error);
      } else {
        setName(renameValue.trim());
        setRenameOpen(false);
        toast.success("Formulário renomeado.");
      }
    });
  }

  function handleDelete() {
    startDeleting(async () => {
      const res = await deleteTemplate(template.id, template.project_id);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Formulário apagado.");
        router.push(
          template.project_id ? `/projects/${template.project_id}` : "/settings/forms",
        );
      }
    });
  }

  function handleSaveAsTemplate() {
    startSavingAsTemplate(async () => {
      const res = await saveAsTemplate(template.id);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Salvo como template em Configurações > Formulários.");
        router.refresh();
      }
    });
  }

  const previewSections = useMemo(
    () =>
      sections.map((s) => ({
        section: s,
        fields: fields.filter((f) => f.section_local_id === s.local_id),
      })),
    [sections, fields],
  );

  const fieldCounts = useMemo(() => {
    let questions = 0;
    let informational = 0;
    let required = 0;
    for (const f of fields) {
      if (f.type === "info" || f.type === "image") {
        informational += 1;
      } else {
        questions += 1;
        if (f.required && f.type !== "table") required += 1;
      }
    }
    return { questions, informational, required };
  }, [fields]);

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 -mx-4 flex flex-col gap-2 border-b bg-background/80 px-4 py-2 backdrop-blur sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-auto border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0 sm:text-xl"
            placeholder="Nome do formulário"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-1.5 h-4 w-4" />
                Configurações
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Configurações do formulário</DialogTitle>
                <DialogDescription>
                  Descrição, layout e ambientes do template.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrição</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Descrição (opcional)"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Modo de layout</Label>
                  <Select
                    value={layoutMode}
                    onValueChange={(v) => setLayoutMode(v as LayoutMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Padrão</SelectItem>
                      <SelectItem value="matrix">Matriz por ambiente</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Use &quot;Matriz por ambiente&quot; quando as mesmas perguntas se
                    repetem para várias áreas (ex.: WC 01, WC 02…).
                  </p>
                </div>
                {layoutMode === "matrix" ? (
                  <EnvironmentsEditor value={environments} onChange={setEnvironments} />
                ) : null}
              </div>
            </DialogContent>
          </Dialog>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="px-2" title="Mais opções">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setRenameValue(name);
                  setRenameOpen(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Renomear
              </DropdownMenuItem>
              {!template.is_template ? (
                <DropdownMenuItem
                  onClick={handleSaveAsTemplate}
                  disabled={isSavingAsTemplate}
                >
                  <BookmarkPlus className="mr-2 h-4 w-4" />
                  {isSavingAsTemplate ? "Salvando…" : "Salvar como template"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Apagar formulário
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={handleSave} disabled={isSaving} size="sm">
            <Save className="mr-1.5 h-4 w-4" />
            {isSaving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>

      <PanelGroup
        orientation="horizontal"
        className="!block !overflow-visible lg:!flex"
        id="template-builder-panels"
      >
        <Panel
          defaultSize={62}
          minSize={30}
          id="editor-panel"
          className="!overflow-visible lg:!overflow-hidden"
        >
          <div className="min-w-0 space-y-3 lg:pr-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-muted-foreground">
                {sections.length} {sections.length === 1 ? "seção" : "seções"} ·{" "}
                {fieldCounts.questions}{" "}
                {fieldCounts.questions === 1 ? "pergunta" : "perguntas"}
                {fieldCounts.informational > 0 ? (
                  <>
                    {" "}
                    · {fieldCounts.informational}{" "}
                    {fieldCounts.informational === 1 ? "informativo" : "informativos"}
                  </>
                ) : null}{" "}
                · {fieldCounts.required}{" "}
                {fieldCounts.required === 1 ? "obrigatória" : "obrigatórias"}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={addSection}
                className="w-full sm:w-auto"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Nova seção
              </Button>
            </div>

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
                items={sections.map((s) => s.local_id)}
                strategy={verticalListSortingStrategy}
              >
                {sections.map((section) => {
                  const sectionFields = fields.filter(
                    (f) => f.section_local_id === section.local_id,
                  );
                  const collapsed = collapsedSections.has(section.local_id);

                  return (
                    <SortableSectionShell
                      key={section.local_id}
                      id={section.local_id}
                      highlighted={
                        editorFocus?.kind === "section" &&
                        editorFocus.id === section.local_id
                      }
                    >
                      {(dragHandle) => (
                        <SectionDropZone id={section.local_id}>
                          <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-2 py-1.5">
                            {dragHandle}
                            <button
                              type="button"
                              onClick={() => toggleSection(section.local_id)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"
                              aria-label={collapsed ? "Expandir" : "Recolher"}
                            >
                              {collapsed ? (
                                <ChevronRight className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>

                            <Input
                              value={section.title}
                              onChange={(e) =>
                                updateSection(section.local_id, (s) => ({
                                  ...s,
                                  title: e.target.value,
                                }))
                              }
                              placeholder="Título da seção"
                              className="h-7 min-w-[12rem] flex-1 border-0 bg-transparent px-1 font-semibold uppercase tracking-wide shadow-none focus-visible:ring-0"
                            />
                            <Input
                              value={section.subtitle ?? ""}
                              onChange={(e) =>
                                updateSection(section.local_id, (s) => ({
                                  ...s,
                                  subtitle: e.target.value || null,
                                }))
                              }
                              placeholder="Subtítulo (opcional)"
                              className="hidden h-7 flex-1 border-0 bg-transparent px-1 italic text-muted-foreground shadow-none focus-visible:ring-0 md:block"
                            />

                            <div className="ml-auto flex items-center gap-1.5 pl-2">
                              <ColumnsPicker
                                value={section.columns}
                                onChange={(v) =>
                                  updateSection(section.local_id, (s) => ({
                                    ...s,
                                    columns: v,
                                  }))
                                }
                              />
                              <span className="text-xs text-muted-foreground">
                                ({sectionFields.length})
                              </span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive-foreground"
                                onClick={() => deleteSection(section.local_id)}
                                title="Excluir seção"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {!collapsed ? (
                            <div className="space-y-2 p-2">
                              {sectionFields.length === 0 ? (
                                <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                                  Sem campos nesta seção.
                                </div>
                              ) : (
                                <SortableContext
                                  items={sectionFields.map((f) => f.localId)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  <div className="space-y-1.5">
                                    {sectionFields.map((field) => (
                                      <FieldAccordionItem
                                        key={field.localId}
                                        field={field}
                                        sections={sections}
                                        allFields={fields}
                                        templateId={template.id}
                                        expanded={expandedFieldLocalId === field.localId}
                                        highlighted={
                                          editorFocus?.kind === "field" &&
                                          editorFocus.id === field.localId
                                        }
                                        autoFocusLabel={
                                          justCreatedLocalId === field.localId
                                        }
                                        onToggle={() => toggleField(field.localId)}
                                        onChange={(updater) =>
                                          updateField(field.localId, updater)
                                        }
                                        onDelete={() => deleteField(field.localId)}
                                        onDuplicate={() => duplicateField(field.localId)}
                                        onMoveToSection={(secId) =>
                                          moveField(field.localId, secId)
                                        }
                                      />
                                    ))}
                                  </div>
                                </SortableContext>
                              )}

                              <AddFieldBar
                                onAdd={(type) => addField(section.local_id, type)}
                              />
                            </div>
                          ) : null}
                        </SectionDropZone>
                      )}
                    </SortableSectionShell>
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
        </Panel>

        <PanelResizeHandle className="group relative mx-1 hidden w-2 items-center justify-center lg:flex">
          <div className="h-full w-px bg-border transition-colors group-hover:bg-primary/50 group-data-[resize-handle-active=pointer]:bg-primary" />
          <div className="absolute flex h-6 w-3 items-center justify-center rounded-sm border bg-background shadow-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="8"
              height="14"
              viewBox="0 0 8 14"
              className="text-muted-foreground"
            >
              <circle cx="2" cy="2" r="1" fill="currentColor" />
              <circle cx="6" cy="2" r="1" fill="currentColor" />
              <circle cx="2" cy="7" r="1" fill="currentColor" />
              <circle cx="6" cy="7" r="1" fill="currentColor" />
              <circle cx="2" cy="12" r="1" fill="currentColor" />
              <circle cx="6" cy="12" r="1" fill="currentColor" />
            </svg>
          </div>
        </PanelResizeHandle>

        <Panel
          defaultSize={38}
          minSize={20}
          id="preview-panel"
          className="mt-4 !overflow-visible lg:mt-0 lg:!overflow-hidden"
        >
          <div className="lg:pl-1">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {name || "(sem título)"}
                    </CardTitle>
                    {description ? (
                      <CardDescription className="truncate text-xs">
                        {description}
                      </CardDescription>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Preview
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <PreviewBody
                  templateId={template.id}
                  previewSections={previewSections}
                  layoutMode={layoutMode}
                  environments={environments}
                  compact
                  onFocusSection={(localId) =>
                    revealInEditor({ kind: "section", id: localId })
                  }
                  onFocusField={(localId) =>
                    revealInEditor({ kind: "field", id: localId })
                  }
                />
              </CardContent>
            </Card>
          </div>
        </Panel>
      </PanelGroup>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear formulário</DialogTitle>
            <DialogDescription>
              Informe o novo nome para este formulário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Novo nome</Label>
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Nome do formulário"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRenameOpen(false)}
                disabled={isRenaming}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleRename}
                disabled={isRenaming || !renameValue.trim()}
              >
                {isRenaming ? "Salvando…" : "Renomear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apagar formulário?</DialogTitle>
            <DialogDescription>
              Esta ação é permanente e não pode ser desfeita. Todos os campos e seções
              deste formulário serão removidos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Apagando…" : "Apagar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddFieldBar({ onAdd }: { onAdd: (type: FieldType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-1">
      {open ? (
        <div className="rounded-md border bg-muted/30 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium">Escolha um tipo</span>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-5">
            {FIELD_TYPE_ORDER.map((t) => {
              const meta = TYPE_META[t];
              const Icon = meta.icon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    onAdd(t);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border bg-background px-2 py-2 text-[11px] transition-colors hover:bg-foreground hover:text-background",
                  )}
                  title={meta.description}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{meta.short}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(true)}
          className="w-full justify-start text-muted-foreground hover:text-foreground"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar campo
        </Button>
      )}
    </div>
  );
}

function buildPreviewField(f: EditorField, templateId: string): ClFormField {
  return {
    id: f.localId,
    template_id: templateId,
    section_id: null,
    group_key: f.group_key,
    label: f.label,
    help_text: f.help_text,
    type: f.type,
    required: f.required,
    column_span: f.column_span,
    position: 0,
    options: f.options,
    visible_when: f.visible_when,
    created_at: new Date().toISOString(),
  };
}

function buildInitialValues(
  previewSections: { section: EditorSection; fields: EditorField[] }[],
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const { fields: sf } of previewSections) {
    for (const f of sf) {
      if (isDisplayOnly(f.type)) continue;
      out[makeFieldKey(f.localId)] = {
        value: f.type === "checkbox" ? "false" : null,
      };
    }
  }
  return out;
}

const PREVIEW_CONTROL_SELECTOR =
  "input, textarea, select, button, a, [role='combobox'], [role='listbox'], [role='radio'], [role='checkbox'], [role='option'], [role='switch']";

function previewClickFocusesEditor(target: EventTarget | null) {
  return !(target instanceof Element && target.closest(PREVIEW_CONTROL_SELECTOR));
}

function PreviewBody({
  templateId,
  previewSections,
  layoutMode,
  environments,
  compact = false,
  onFocusSection,
  onFocusField,
}: {
  templateId: string;
  previewSections: { section: EditorSection; fields: EditorField[] }[];
  layoutMode: LayoutMode;
  environments: string[];
  compact?: boolean;
  onFocusSection: (localId: string) => void;
  onFocusField: (localId: string) => void;
}) {
  const [values, setValues] = useState<Record<string, FieldValue>>(() =>
    buildInitialValues(previewSections),
  );

  function setFieldValue(key: string, patch: Partial<FieldValue>) {
    setValues((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function resetValues() {
    setValues(buildInitialValues(previewSections));
  }

  if (
    previewSections.length === 0 ||
    previewSections.every((s) => s.fields.length === 0)
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        Adicione campos para visualizar o formulário aqui.
      </p>
    );
  }

  const isMatrix = layoutMode === "matrix";

  return (
    <div className={cn("space-y-6", compact && "space-y-4 text-sm")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {isMatrix
            ? `Matriz: ${environments.join(" • ")}. `
            : "Preencha os campos para testar exibições condicionais. "}
          Clique numa seção ou num campo para localizá-lo no editor.
        </p>
        <button
          type="button"
          onClick={resetValues}
          className="shrink-0 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Limpar
        </button>
      </div>

      {previewSections.map(({ section, fields: sf }) => (
        <div key={section.local_id} className="space-y-3">
          <div
            className="cursor-pointer border-b pb-1"
            title="Mostrar seção no editor"
            onClick={() => onFocusSection(section.local_id)}
          >
            <div className="inline-block bg-foreground px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-background">
              {section.title || "(sem título)"}
            </div>
            {section.subtitle ? (
              <p className="mt-1 text-xs italic text-muted-foreground">
                {section.subtitle}
              </p>
            ) : null}
          </div>
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))`,
            }}
          >
            {sf.map((f) => {
              const key = makeFieldKey(f.localId);
              const visible = evaluateVisible(f.visible_when, values);
              if (!visible) return null;
              const previewField = buildPreviewField(f, templateId);
              return (
                <div
                  key={f.localId}
                  title="Mostrar campo no editor"
                  className="cursor-pointer rounded-sm transition-shadow hover:ring-2 hover:ring-primary/30"
                  style={{
                    gridColumn: `span ${Math.min(f.column_span, section.columns)}`,
                  }}
                  onClick={(event) => {
                    if (!previewClickFocusesEditor(event.target)) return;
                    onFocusField(f.localId);
                  }}
                >
                  <FieldInputControl
                    field={previewField}
                    value={values[key]}
                    onChange={(patch) => setFieldValue(key, patch)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function EnvironmentsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="space-y-2">
      <Label className="text-xs">Ambientes</Label>
      <div className="flex flex-wrap gap-2">
        {value.map((env, idx) => (
          <div
            key={`${env}-${idx}`}
            className="flex items-center gap-1 rounded-full border bg-background px-3 py-1 text-sm"
          >
            <span>{env}</span>
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive-foreground"
              onClick={() => onChange(value.filter((_, i) => i !== idx))}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ex.: WC 01"
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              e.preventDefault();
              onChange([...value, draft.trim()]);
              setDraft("");
            }
          }}
          className="max-w-[260px]"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (draft.trim()) {
              onChange([...value, draft.trim()]);
              setDraft("");
            }
          }}
        >
          Adicionar
        </Button>
      </div>
    </div>
  );
}
