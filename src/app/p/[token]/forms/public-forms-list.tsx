"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Eraser,
  History,
  Lock,
  LogOut,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { BackLink } from "@/components/layout/back-link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getDisciplineIcon } from "@/lib/disciplines/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

import type {
  ClDiscipline,
  ClFormSubmission,
  ClFormTemplate,
  ClProject,
} from "@/lib/supabase/types";

import { createPublicSubmission } from "../actions";
import { clearIdentity, readIdentity } from "../identity-storage";
import { PreviewBanner } from "../preview-banner";
import { PREVIEW_IDENTITY, withPreview } from "../preview-mode";
import {
  clearAllDraftsForToken,
  clearDraftProgress,
  clearDraftSubmission,
  readDraftProgress,
  readDraftSubmission,
} from "../draft-progress";
import { PublicFooter, type PublicOfficeSettings } from "../public-footer";

interface Props {
  token: string;
  project: ClProject;
  disciplines: ClDiscipline[];
  templates: ClFormTemplate[];
  submissions: Pick<ClFormSubmission, "id" | "template_id" | "client_email" | "status">[];
  requiredCountByTemplate: Record<string, number>;
  totalAllByTemplate: Record<string, number>;
  answeredAllByTemplate: Record<string, number>;
  hasPreviousByTemplate: Record<string, boolean>;
  allowResubmit: boolean;
  officeSettings: PublicOfficeSettings | null;
  isProjectOwner?: boolean;
  preview?: boolean;
}

export function PublicFormsList({
  token,
  project,
  disciplines,
  templates,
  submissions,
  requiredCountByTemplate,
  totalAllByTemplate,
  answeredAllByTemplate,
  hasPreviousByTemplate,
  allowResubmit,
  officeSettings,
  isProjectOwner = false,
  preview = false,
}: Props) {
  const router = useRouter();
  const [identity, setIdentity] = useState<{
    client_name: string;
    client_email: string;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [isSubmitting, startSubmitting] = useTransition();

  useEffect(() => {
    if (preview) {
      setIdentity(PREVIEW_IDENTITY);
      setHydrated(true);
      return;
    }
    const saved = readIdentity(token);
    setHydrated(true);
    if (!saved) {
      router.replace(`/p/${token}`);
      return;
    }
    setIdentity(saved);
  }, [preview, token, router]);

  const completedByTemplate = useMemo(() => {
    if (preview || !identity) return new Set<string>();
    const email = identity.client_email.toLowerCase();
    const set = new Set<string>();
    for (const s of submissions) {
      if (s.status === "submitted" && s.client_email?.toLowerCase() === email) {
        const answered = answeredAllByTemplate[s.template_id] ?? 0;
        const total = totalAllByTemplate[s.template_id] ?? 0;
        if (total === 0 || answered >= total) {
          set.add(s.template_id);
        }
      }
    }
    return set;
  }, [preview, submissions, identity, answeredAllByTemplate, totalAllByTemplate]);

  const [progressTick, setProgressTick] = useState(0);

  useEffect(() => {
    function handleUpdate() {
      setProgressTick((n) => n + 1);
    }
    window.addEventListener("checklist-progress", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("checklist-progress", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const progressByTemplate = useMemo(() => {
    const map = new Map<
      string,
      { done: number; total: number; doneAll: number; totalAll: number }
    >();
    if (!identity) return map;
    for (const t of templates) {
      const total = requiredCountByTemplate[t.id] ?? 0;
      const serverTotalAll = totalAllByTemplate[t.id] ?? 0;
      if (preview) {
        map.set(t.id, { done: 0, total, doneAll: 0, totalAll: serverTotalAll });
        continue;
      }
      const serverAnsweredAll = Math.min(
        answeredAllByTemplate[t.id] ?? 0,
        serverTotalAll,
      );
      if (completedByTemplate.has(t.id)) {
        map.set(t.id, {
          done: total,
          total,
          doneAll: serverTotalAll || 1,
          totalAll: serverTotalAll || 1,
        });
        continue;
      }
      const draft = readDraftProgress(token, t.id, identity.client_email);
      const done = Math.min(draft?.done ?? 0, total);
      const draftTotalAll = draft?.totalAll;
      const draftDoneAll = draft?.doneAll;
      const useDraft = typeof draftTotalAll === "number" && draftTotalAll > 0;
      const totalAll = useDraft ? draftTotalAll! : serverTotalAll;
      const baseDoneAll = useDraft
        ? Math.min(draftDoneAll ?? 0, draftTotalAll!)
        : serverAnsweredAll;
      const doneAll = Math.min(
        Math.max(baseDoneAll, useDraft ? 0 : serverAnsweredAll),
        totalAll,
      );
      map.set(t.id, { done, total, doneAll, totalAll });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    templates,
    completedByTemplate,
    identity,
    requiredCountByTemplate,
    totalAllByTemplate,
    answeredAllByTemplate,
    preview,
    token,
    progressTick,
  ]);

  const groups = useMemo(() => {
    const map = new Map<
      string | null,
      { discipline: ClDiscipline | null; templates: ClFormTemplate[] }
    >();
    for (const t of templates) {
      const key = t.discipline_id;
      if (!map.has(key)) {
        const discipline = disciplines.find((d) => d.id === key) ?? null;
        map.set(key, { discipline, templates: [] });
      }
      map.get(key)!.templates.push(t);
    }
    const arr = Array.from(map.values());
    // Ordena grupos pela posição da disciplina
    arr.sort((a, b) => {
      if (!a.discipline && !b.discipline) return 0;
      if (!a.discipline) return 1;
      if (!b.discipline) return -1;
      return a.discipline.position - b.discipline.position;
    });
    // Ordena templates dentro de cada grupo pela posição do formulário
    for (const group of arr) {
      group.templates.sort((a, b) => a.position - b.position);
    }
    return arr;
  }, [templates, disciplines]);

  const pendingTemplates = templates.filter((t) => !completedByTemplate.has(t.id));
  const readyPendingTemplates = pendingTemplates.filter((t) => {
    const progress = progressByTemplate.get(t.id);
    const requiredTotal = requiredCountByTemplate[t.id] ?? 0;
    return requiredTotal === 0 || Boolean(progress && progress.done >= progress.total);
  });
  const canSubmitAll =
    pendingTemplates.length > 0 &&
    readyPendingTemplates.length === pendingTemplates.length;

  function formatQuestionCount(count: number, singular: string, plural: string) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function handleLogout() {
    clearIdentity(token);
    router.push(`/p/${token}`);
  }

  function handleClearLocalDrafts() {
    const removed = clearAllDraftsForToken(token);
    if (removed === 0) {
      toast.info("Nenhum rascunho local encontrado neste navegador.");
    } else {
      toast.success(
        removed === 1
          ? "1 rascunho local removido."
          : `${removed} rascunhos locais removidos.`,
      );
    }
    router.refresh();
  }

  function handleSubmitAll() {
    if (preview || !identity) return;
    if (pendingTemplates.length === 0) {
      toast.success("Todos os formulários já foram enviados.");
      return;
    }
    const incomplete = pendingTemplates.filter((t) => {
      const progress = progressByTemplate.get(t.id);
      const requiredTotal = requiredCountByTemplate[t.id] ?? 0;
      return requiredTotal > 0 && (!progress || progress.done < progress.total);
    });
    if (incomplete.length > 0) {
      toast.error(
        `Complete os campos obrigatórios de ${incomplete[0].name} antes de enviar.`,
      );
      return;
    }

    const drafts = pendingTemplates.map((t) => ({
      template: t,
      draft: readDraftSubmission(token, t.id, identity.client_email),
    }));
    const missingDraft = drafts.find(
      ({ template, draft }) => !draft && (requiredCountByTemplate[template.id] ?? 0) > 0,
    );
    if (missingDraft) {
      toast.error(
        `Abra ${missingDraft.template.name} para salvar as respostas antes de enviar.`,
      );
      return;
    }

    startSubmitting(async () => {
      for (const { template, draft } of drafts) {
        const res = await createPublicSubmission({
          token,
          template_id: template.id,
          client_name: identity.client_name,
          client_email: identity.client_email,
          values: draft?.values ?? [],
          matrix_values: draft?.matrix_values ?? [],
        });

        if (res && "error" in res && res.error) {
          toast.error(`${template.name}: ${res.error}`);
          router.refresh();
          return;
        }

        clearDraftProgress(token, template.id, identity.client_email);
        clearDraftSubmission(token, template.id, identity.client_email);
      }

      router.push(`/p/${token}/submitted`);
    });
  }

  if (!hydrated || !identity) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary dark:bg-background">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const showSubmitBar = templates.length > 0 && !preview;

  return (
    <div
      className={`flex min-h-screen flex-col bg-secondary dark:bg-background ${showSubmitBar ? "pb-36 sm:pb-24" : ""}`}
    >
      <div className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <BackLink href={withPreview(`/p/${token}`, preview)}>Voltar à capa</BackLink>
          <div className="flex min-w-0 items-center gap-1">
            {preview ? null : (
              <div className="hidden text-right text-xs text-muted-foreground sm:block">
                <div className="font-medium text-foreground">{identity.client_name}</div>
                <div className="truncate">{identity.client_email}</div>
              </div>
            )}
            <ThemeToggle />
            {preview ? null : (
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="mr-1 h-3.5 w-3.5" />
                Sair
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:py-8">
        <div>
          <h1 className="break-words text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha os formulários abaixo e preencha na ordem que preferir.
          </p>
        </div>

        {preview ? <PreviewBanner /> : null}

        {isProjectOwner && !preview ? (
          <div className="flex flex-col gap-3 rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              Visualizando como dono do projeto. As contagens de &quot;respondidas&quot;
              podem incluir rascunhos salvos neste navegador, mesmo após excluir os envios
              do servidor.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClearLocalDrafts}
              className="self-start sm:self-auto"
            >
              <Eraser className="mr-1.5 h-3.5 w-3.5" />
              Limpar rascunhos locais
            </Button>
          </div>
        ) : null}

        {templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum formulário disponível neste link no momento.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map(({ discipline, templates: groupTemplates }) => {
              const Icon = getDisciplineIcon(discipline?.name);
              return (
                <section key={discipline?.id ?? "no-discipline"}>
                  <div className="mb-2 mt-2 flex items-center gap-2 pt-[23px]">
                    <Icon
                      className="h-4 w-4"
                      style={discipline ? { color: discipline.color } : undefined}
                      aria-hidden
                    />
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {discipline?.name ?? "Sem disciplina"}
                    </h2>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,27rem),1fr))]">
                    {groupTemplates.map((t) => {
                      const completed = completedByTemplate.has(t.id);
                      const progress = progressByTemplate.get(t.id) ?? {
                        done: 0,
                        total: requiredCountByTemplate[t.id] ?? 0,
                        doneAll: 0,
                        totalAll: 0,
                      };
                      const hasRequired = progress.total > 0;
                      const isComplete =
                        completed || (hasRequired && progress.done >= progress.total);
                      const hasPrevious =
                        !preview && Boolean(hasPreviousByTemplate[t.id]);
                      const safeDone = Math.min(progress.done, progress.total);
                      const safeDoneAll = Math.min(progress.doneAll, progress.totalAll);
                      const remainingAll = progress.totalAll - safeDoneAll;
                      const serverAnsweredAll = Math.min(
                        answeredAllByTemplate[t.id] ?? 0,
                        progress.totalAll,
                      );
                      const previousAnswered = completed
                        ? safeDoneAll
                        : Math.min(serverAnsweredAll, safeDoneAll);
                      const currentAnswered = Math.max(0, safeDoneAll - previousAnswered);
                      const previousPct =
                        progress.totalAll > 0
                          ? (previousAnswered / progress.totalAll) * 100
                          : 0;
                      const currentPct =
                        progress.totalAll > 0
                          ? (currentAnswered / progress.totalAll) * 100
                          : 0;
                      const showProgressBar = progress.totalAll > 0 || completed;
                      return (
                        <Link
                          key={t.id}
                          href={withPreview(`/p/${token}/forms/${t.id}`, preview)}
                          className="block"
                        >
                          <Card className="h-full transition-colors hover:border-primary/40">
                            <CardContent className="flex items-start justify-between gap-3 p-4 sm:items-center">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="min-w-0 break-words font-medium">
                                    {t.name}
                                  </span>
                                  {completed ? (
                                    <Badge
                                      variant="outline"
                                      className="border-success text-success-foreground"
                                    >
                                      <CheckCircle2 className="mr-1 h-3 w-3" />
                                      Concluído
                                    </Badge>
                                  ) : null}
                                </div>
                                {t.description ? (
                                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                                    {t.description}
                                  </p>
                                ) : null}
                                {hasRequired || hasPrevious ? (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {hasRequired ? (
                                      <Badge
                                        variant="outline"
                                        className={
                                          isComplete
                                            ? "border-success text-success-foreground"
                                            : safeDone > 0
                                              ? "border-warning text-warning-foreground"
                                              : "text-muted-foreground"
                                        }
                                      >
                                        {safeDone}/{progress.total} obrigatórios
                                      </Badge>
                                    ) : null}
                                    {hasPrevious && !completed ? (
                                      allowResubmit ? (
                                        <Badge
                                          variant="outline"
                                          className="border-warning text-warning-foreground"
                                        >
                                          <History className="mr-1 h-3 w-3" />
                                          Histórico disponível
                                        </Badge>
                                      ) : (
                                        <Badge
                                          variant="outline"
                                          className="border-muted-foreground/30 text-muted-foreground"
                                        >
                                          <Lock className="mr-1 h-3 w-3" />
                                          Herda respostas anteriores
                                        </Badge>
                                      )
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            </CardContent>
                            {showProgressBar ? (
                              <CardFooter className="flex-col items-stretch gap-2 border-t bg-muted/20 p-3">
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>
                                    {formatQuestionCount(
                                      safeDoneAll,
                                      "respondida",
                                      "respondidas",
                                    )}
                                    {previousAnswered > 0 && currentAnswered > 0 ? (
                                      <span className="ml-1 text-[11px] text-muted-foreground/80">
                                        ({previousAnswered} antes
                                        {" \u00b7 "}
                                        {currentAnswered} agora)
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                                <div
                                  role="progressbar"
                                  aria-valuemin={0}
                                  aria-valuemax={progress.totalAll}
                                  aria-valuenow={safeDoneAll}
                                  aria-label={`${safeDoneAll} de ${progress.totalAll} perguntas respondidas — ${previousAnswered} em envios anteriores e ${currentAnswered} preenchidas agora`}
                                  className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                                >
                                  <span
                                    className="h-full bg-primary/40 transition-all"
                                    style={{ width: `${previousPct}%` }}
                                  />
                                  <span
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${currentPct}%` }}
                                  />
                                </div>
                              </CardFooter>
                            ) : null}
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <PublicFooter officeSettings={officeSettings} />

      {showSubmitBar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.35)] backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Envio geral</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Preencha os formulários e use este botão para enviar tudo de uma vez.
              </p>
            </div>
            <Button
              onClick={handleSubmitAll}
              disabled={!canSubmitAll || isSubmitting}
              className="w-full shrink-0 sm:w-auto"
            >
              <Send className="mr-2 h-4 w-4" />
              {isSubmitting ? "Enviando..." : "Enviar todos os formulários"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
