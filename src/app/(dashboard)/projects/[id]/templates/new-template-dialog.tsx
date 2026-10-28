"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

import type { ClDiscipline } from "@/lib/supabase/types";

import { createTemplate } from "./actions";

export function NewTemplateDialog({
  projectId,
  disciplines,
  trigger,
  insertBeforeId,
  defaultDisciplineId = null,
  lockDiscipline = false,
  open: controlledOpen,
  onOpenChange,
}: {
  projectId: string;
  disciplines: ClDiscipline[];
  trigger?: React.ReactNode;
  insertBeforeId?: string;
  defaultDisciplineId?: string | null;
  lockDiscipline?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const formId = useId();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const [discipline, setDiscipline] = useState<string>(defaultDisciplineId ?? "none");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) setDiscipline(defaultDisciplineId ?? "none");
  }, [open, defaultDisciplineId]);

  function setOpen(next: boolean) {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("discipline_id", discipline);
    if (insertBeforeId) formData.set("insert_before_id", insertBeforeId);

    startTransition(async () => {
      const result = await createTemplate(projectId, formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo formulário</DialogTitle>
          <DialogDescription>
            {insertBeforeId
              ? "O formulário entra nesta posição da lista. Depois você adiciona os campos."
              : "Após criar, você poderá adicionar campos e layout personalizado."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-name`}>Nome</Label>
            <Input
              id={`${formId}-name`}
              name="name"
              required
              placeholder="Ex: Premissas de estrutura"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-description`}>Descrição</Label>
            <Textarea
              id={`${formId}-description`}
              name="description"
              rows={3}
              placeholder="Descrição opcional"
            />
          </div>
          <div className="space-y-2">
            <Label>Disciplina</Label>
            <Select
              value={discipline}
              onValueChange={setDiscipline}
              disabled={lockDiscipline}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem disciplina</SelectItem>
                {disciplines.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Criando..." : "Criar e editar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
