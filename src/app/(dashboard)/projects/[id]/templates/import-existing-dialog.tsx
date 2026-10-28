"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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

import { importExistingTemplate } from "./actions";

function releaseDialogLock() {
  document.body.style.pointerEvents = "";
  document.body.removeAttribute("data-scroll-locked");
}

export interface ImportableTemplate {
  id: string;
  name: string;
  project_id: string | null;
  discipline_name: string | null;
  discipline_color: string | null;
}

export function ImportExistingTemplateDialog({
  targetProjectId,
  templates,
  trigger,
}: {
  targetProjectId: string;
  templates: ImportableTemplate[];
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const refreshAfterClose = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (open || !refreshAfterClose.current) return;
    let cancelled = false;
    const started = performance.now();

    function finish() {
      if (cancelled || !refreshAfterClose.current) return;
      refreshAfterClose.current = false;
      releaseDialogLock();
      router.refresh();
    }

    function waitForDialogExit() {
      if (cancelled) return;
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog || performance.now() - started > 800) {
        finish();
        return;
      }
      window.setTimeout(waitForDialogExit, 50);
    }

    const timeout = window.setTimeout(waitForDialogExit, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) =>
      [t.name, t.discipline_name ?? ""].join(" ").toLowerCase().includes(q),
    );
  }, [templates, query]);

  function handleImport(templateId: string, templateName: string) {
    setPendingId(templateId);
    startTransition(async () => {
      const result = await importExistingTemplate(targetProjectId, templateId);
      setPendingId(null);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Formulário "${templateName}" adicionado ao projeto.`);
        refreshAfterClose.current = true;
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar template ao projeto</DialogTitle>
          <DialogDescription>
            Escolha um template da biblioteca para copiar (campos, seções e layout) para
            este projeto.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou disciplina..."
            className="pl-9"
          />
        </div>

        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {templates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum template disponível na biblioteca. Salve um formulário existente como
              template em qualquer projeto para reutilizá-lo.
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum template corresponde à busca.
            </p>
          ) : (
            filtered.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="mt-0.5">
                    {t.discipline_name ? (
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        style={{
                          borderColor: t.discipline_color ?? undefined,
                          color: t.discipline_color ?? undefined,
                        }}
                      >
                        {t.discipline_name}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        Sem disciplina
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId === t.id}
                  onClick={() => handleImport(t.id, t.name)}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {pendingId === t.id ? "Copiando..." : "Adicionar"}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
