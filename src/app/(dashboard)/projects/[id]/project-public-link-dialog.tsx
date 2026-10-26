"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import type { ClFormTemplate, ClPublicLink } from "@/lib/supabase/types";

import {
  createProjectPublicLink,
  deleteProjectLink,
  setProjectLinkActive,
  setTemplatePublic,
} from "./actions";

interface Props {
  projectId: string;
  initialLinks: ClPublicLink[];
  templates: ClFormTemplate[];
}

export function ProjectPublicLinkDialog({ projectId, initialLinks, templates }: Props) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<ClPublicLink[]>(initialLinks);
  const [templatesState, setTemplatesState] = useState<ClFormTemplate[]>(templates);
  const [isCreating, startCreating] = useTransition();
  const [origin, setOrigin] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  function buildUrl(token: string) {
    return `${origin}/p/${token}`;
  }

  function buildPreviewUrl(token: string) {
    return `${buildUrl(token)}?preview=1`;
  }

  function handleCreate() {
    startCreating(async () => {
      const res = await createProjectPublicLink(projectId);
      if (res.error || !res.data) {
        toast.error(res.error ?? "Erro ao criar link.");
        return;
      }
      setLinks((prev) => [
        {
          id: res.data.id,
          token: res.data.token,
          template_id: null,
          project_id: projectId,
          created_by: "",
          is_active: true,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      toast.success("Link gerado com sucesso.");
    });
  }

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(buildUrl(token));
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  async function handleToggle(link: ClPublicLink, isActive: boolean) {
    const previous = link.is_active;
    setLinks((prev) =>
      prev.map((l) => (l.id === link.id ? { ...l, is_active: isActive } : l)),
    );
    const res = await setProjectLinkActive(link.id, isActive);
    if (res.error) {
      toast.error(res.error);
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, is_active: previous } : l)),
      );
    } else {
      toast.success(isActive ? "Link ativado." : "Link desativado.");
    }
  }

  async function handleDelete(link: ClPublicLink) {
    const res = await deleteProjectLink(link.id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== link.id));
    toast.success("Link removido.");
  }

  async function handleTemplateToggle(templateId: string, isPublic: boolean) {
    const previous = templatesState.find((t) => t.id === templateId)?.is_public;
    setTemplatesState((prev) =>
      prev.map((t) => (t.id === templateId ? { ...t, is_public: isPublic } : t)),
    );
    const res = await setTemplatePublic(templateId, isPublic);
    if (res.error) {
      toast.error(res.error);
      setTemplatesState((prev) =>
        prev.map((t) =>
          t.id === templateId ? { ...t, is_public: previous ?? true } : t,
        ),
      );
    }
  }

  const activeLink = links.find((l) => l.is_active);

  return (
    <>
      {activeLink ? (
        <>
          <Button
            variant="outline"
            size="sm"
            title="Copiar link público"
            onClick={() => handleCopy(activeLink.token)}
          >
            <Copy className="mr-2 h-4 w-4" />
            Copiar link
          </Button>
          <Button variant="outline" size="sm" title="Abrir link público" asChild>
            <a
              href={buildUrl(activeLink.token)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            title="Visualizar o formulário sem gravar respostas"
            asChild
          >
            <a
              href={buildPreviewUrl(activeLink.token)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Eye className="mr-2 h-4 w-4" />
              Visualizar
            </a>
          </Button>
        </>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Send className="mr-2 h-4 w-4" />
            Enviar checklist
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Enviar checklist ao cliente</DialogTitle>
            <DialogDescription>
              Gere um link e envie para o cliente preencher os checklists deste projeto.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {links.length === 0 && (
              <div className="flex justify-end">
                <Button onClick={handleCreate} disabled={isCreating} size="sm">
                  {isCreating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Gerar link
                </Button>
              </div>
            )}

            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum link gerado ainda.</p>
            ) : (
              <div className="space-y-3">
                {links.map((link) => {
                  const url = buildUrl(link.token);
                  return (
                    <div
                      key={link.id}
                      className="flex flex-col gap-2 rounded-md border p-3"
                    >
                      <Input
                        readOnly
                        value={url}
                        className="h-9 font-mono text-xs"
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopy(link.token)}
                        >
                          <Copy className="mr-1 h-3.5 w-3.5" />
                          Copiar
                        </Button>
                        <Button variant="outline" size="sm" asChild>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />
                            Abrir
                          </a>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          title="Visualizar o formulário sem gravar respostas"
                          asChild
                        >
                          <a
                            href={buildPreviewUrl(link.token)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" />
                            Visualizar
                          </a>
                        </Button>
                        <div className="ml-auto flex items-center gap-1.5 px-2">
                          <Switch
                            checked={link.is_active}
                            onCheckedChange={(v) => handleToggle(link, v)}
                          />
                          <span className="text-xs text-muted-foreground">
                            {link.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                        <ConfirmDialog
                          destructive
                          title="Remover este link?"
                          description="Os clientes que ainda tiverem este link não conseguirão mais acessar."
                          confirmLabel="Remover"
                          onConfirm={() => handleDelete(link)}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              aria-label="Remover link"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-semibold">Formulários visíveis no link</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Desmarque para ocultar um formulário do link de envio.
              </p>
              {templatesState.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum formulário neste projeto.
                </p>
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {templatesState.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between rounded-md border p-2.5 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {t.is_public ? (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span>{t.name}</span>
                      </div>
                      <Switch
                        checked={t.is_public}
                        onCheckedChange={(v) => handleTemplateToggle(t.id, v)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
