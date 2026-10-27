"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Eye, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { FieldPreview } from "@/components/form-builder/field-preview";
import type { ClFormField, ClFormSection } from "@/lib/supabase/types";
import {
  deleteTemplate,
  duplicateTemplate,
  fetchTemplatePreview,
  renameTemplate,
} from "@/app/(dashboard)/templates/[id]/actions";

interface TemplateCardProps {
  id: string;
  name: string;
  description?: string | null;
  projectId: string | null;
  discipline: { name: string; color: string } | null;
  layoutMode?: "standard" | "matrix";
  environments?: string[] | null;
}

export function TemplateCard({
  id,
  name,
  description,
  projectId,
  discipline,
  layoutMode,
  environments,
}: TemplateCardProps) {
  const router = useRouter();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSections, setPreviewSections] = useState<ClFormSection[]>([]);
  const [previewFields, setPreviewFields] = useState<ClFormField[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [isRenaming, startRenaming] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const [isDuplicating, startDuplicating] = useTransition();

  function handleRename() {
    if (!renameValue.trim()) return;
    startRenaming(async () => {
      const res = await renameTemplate(id, renameValue.trim());
      if (res?.error) {
        toast.error(res.error);
      } else {
        setRenameOpen(false);
        toast.success("Formulário renomeado.");
        router.refresh();
      }
    });
  }

  function handleDelete() {
    startDeleting(async () => {
      const res = await deleteTemplate(id, projectId);
      if (res?.error) {
        toast.error(res.error);
      } else {
        setDeleteOpen(false);
        toast.success("Formulário apagado.");
        router.refresh();
      }
    });
  }

  function handleDuplicate() {
    startDuplicating(async () => {
      const res = await duplicateTemplate(id);
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Formulário duplicado.");
        router.refresh();
      }
    });
  }

  async function handleOpenPreview() {
    setPreviewOpen(true);
    if (previewSections.length === 0 && previewFields.length === 0) {
      setIsLoadingPreview(true);
      const res = await fetchTemplatePreview(id);
      if ("error" in res) {
        toast.error(res.error);
      } else {
        setPreviewSections(res.sections);
        setPreviewFields(res.fields);
      }
      setIsLoadingPreview(false);
    }
  }

  return (
    <>
      <div className="group relative">
        <Link href={`/templates/${id}`} className="block">
          <Card className="h-full overflow-hidden transition-colors hover:border-primary/40">
            {discipline && (
              <div
                className="px-4 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: `${discipline.color}22`,
                  color: discipline.color,
                }}
              >
                {discipline.name}
              </div>
            )}
            <CardHeader className="pb-4 pr-10">
              <CardTitle className="line-clamp-1 text-base">{name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {description?.trim() || "—"}
              </p>
              {layoutMode === "matrix" && environments && environments.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                    Ambientes
                  </p>
                  <ul className="flex flex-wrap gap-1">
                    {environments.map((env) => (
                      <li
                        key={env}
                        className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {env}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardHeader>
          </Card>
        </Link>

        <div
          className="absolute right-2 top-2 flex items-center gap-1"
          onClick={(e) => e.preventDefault()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
            onClick={handleOpenPreview}
          >
            <Eye className="h-4 w-4" />
            <span className="sr-only">Pré-visualizar</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                disabled={isDuplicating}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Opções</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => {
                  setRenameValue(name);
                  setRenameOpen(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate} disabled={isDuplicating}>
                <Copy className="mr-2 h-4 w-4" />
                {isDuplicating ? "Duplicando…" : "Duplicar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive-foreground focus:bg-destructive focus:text-destructive-foreground"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Apagar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

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
              serão removidos.
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

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
          {/* Header */}
          <div className="flex shrink-0 flex-col gap-1 border-b px-6 py-4">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 shrink-0 text-muted-foreground" />
              <DialogTitle className="text-base leading-tight">{name}</DialogTitle>
            </div>
            {discipline && (
              <span
                className="w-fit rounded px-2 py-0.5 text-xs font-medium"
                style={{
                  backgroundColor: `${discipline.color}22`,
                  color: discipline.color,
                }}
              >
                {discipline.name}
              </span>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {isLoadingPreview ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Carregando...
              </div>
            ) : previewFields.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Este formulário ainda não possui campos.
              </p>
            ) : (
              <div className="space-y-8">
                {(() => {
                  const sectionList =
                    previewSections.length > 0
                      ? previewSections
                      : ([
                          {
                            id: "_default",
                            template_id: "",
                            title: "",
                            subtitle: null,
                            columns: 3 as const,
                            position: 0,
                            created_at: "",
                          },
                        ] as ClFormSection[]);

                  return sectionList.map((section) => {
                    const sectionFields =
                      previewSections.length > 0
                        ? previewFields.filter((f) => f.section_id === section.id)
                        : previewFields;
                    if (sectionFields.length === 0) return null;
                    return (
                      <section key={section.id} className="space-y-3">
                        {section.title ? (
                          <div className="border-b pb-1">
                            <div className="inline-block bg-foreground px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-background">
                              {section.title}
                            </div>
                            {section.subtitle ? (
                              <p className="mt-1 text-xs italic text-muted-foreground">
                                {section.subtitle}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        <div
                          className="grid grid-cols-1 gap-4 sm:[grid-template-columns:var(--section-columns)]"
                          style={
                            {
                              "--section-columns": `repeat(${section.columns}, minmax(0, 1fr))`,
                            } as React.CSSProperties
                          }
                        >
                          {sectionFields.map((field) => (
                            <div
                              key={field.id}
                              className="min-w-0 sm:[grid-column:var(--field-span)]"
                              style={
                                {
                                  "--field-span": `span ${Math.min(field.column_span, section.columns)}`,
                                } as React.CSSProperties
                              }
                            >
                              <FieldPreview field={field} />
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
