"use client";

import { useState, useTransition } from "react";
import { Copy, MoreHorizontal, Pencil, Settings, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";

import { deleteProject, duplicateProject, renameProject } from "./actions";
import { ProjectSettingsDialog } from "./project-settings-dialog";

interface ProjectCardMenuProps {
  projectId: string;
  projectName: string;
  projectDescription?: string | null;
}

export function ProjectCardMenu({
  projectId,
  projectName,
  projectDescription,
}: ProjectCardMenuProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(projectName);
  const [descriptionValue, setDescriptionValue] = useState(projectDescription ?? "");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openRename() {
    setRenameValue(projectName);
    setDescriptionValue(projectDescription ?? "");
    setRenameError(null);
    setRenameOpen(true);
  }

  function handleRename() {
    startTransition(async () => {
      const result = await renameProject(projectId, renameValue, descriptionValue);
      if (result && "error" in result && result.error) {
        setRenameError(result.error);
        return;
      }
      setRenameOpen(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteProject(projectId);
      setDeleteOpen(false);
    });
  }

  function handleDuplicate() {
    startTransition(async () => {
      await duplicateProject(projectId);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="h-7 w-7 rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            title="Mais opções"
            onClick={(e) => e.preventDefault()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.preventDefault()}>
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              setSettingsOpen(true);
            }}
          >
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              openRename();
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Renomear
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.preventDefault();
              handleDuplicate();
            }}
            disabled={isPending}
          >
            <Copy className="mr-2 h-4 w-4" />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
            onClick={(e) => {
              e.preventDefault();
              setDeleteOpen(true);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Apagar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear projeto</DialogTitle>
            <DialogDescription>Altere o nome e a descrição do projeto.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="rename-input">Nome</Label>
              <Input
                id="rename-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rename-description">Descrição</Label>
              <Textarea
                id="rename-description"
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                placeholder="Descrição opcional do projeto"
                rows={3}
              />
            </div>
            {renameError ? (
              <p className="text-sm text-destructive">{renameError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRename} disabled={isPending || !renameValue.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar projeto</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja apagar <strong>{projectName}</strong>? Essa ação não
              pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProjectSettingsDialog
        projectId={projectId}
        projectName={projectName}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </>
  );
}
