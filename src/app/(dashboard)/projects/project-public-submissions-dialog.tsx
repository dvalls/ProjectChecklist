"use client";

import { useRef, useState } from "react";
import { ArrowLeft, Eye, Loader2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RichTextOr } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type {
  ClFormField,
  ClFormSubmission,
  ClFormTemplate,
  FieldOptions,
} from "@/lib/supabase/types";

import {
  getProjectSubmissionsReport,
  getSubmissionDetail,
  type ProjectTemplateReport,
  type SubmissionDetail,
} from "./actions";

function formatFieldValue(
  field: Pick<ClFormField, "type" | "options">,
  raw: string | null,
): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  const opts = (field.options as Exclude<FieldOptions, null>) ?? {};
  const choices = opts.choices ?? [];

  if (field.type === "checkbox") return raw === "true" ? "Sim" : "Não";

  if (field.type === "checkbox_group") {
    try {
      const parsed = JSON.parse(raw);
      const selectedLabels = (parsed.selected ?? []).map((v: string) => {
        const choice = choices.find((c) => c.value === v);
        return choice?.label ?? v;
      });
      const parts = [...selectedLabels];
      if (parsed.other) parts.push(`Outra: ${parsed.other}`);
      return parts.length > 0 ? parts.join(", ") : "—";
    } catch {
      return raw;
    }
  }

  if (field.type === "select" || field.type === "radio") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.other === "string") {
        return parsed.other ? `Outra: ${parsed.other}` : "Outra";
      }
    } catch {
      // not JSON, plain value
    }
    const choice = choices.find((c) => c.value === raw);
    return choice?.label ?? raw;
  }

  return raw;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function formatDateShort(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { dateStyle: "short" });
  } catch {
    return iso;
  }
}

export function ProjectPublicSubmissionsDialog({
  projectName,
  projectId,
  submissions,
  templates,
}: {
  projectName: string;
  projectId: string;
  submissions: ClFormSubmission[];
  templates: ClFormTemplate[];
}) {
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const count = submissions.length;

  const [tab, setTab] = useState<"individual" | "compiled">("individual");
  const [report, setReport] = useState<ProjectTemplateReport[] | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const fetchingRef = useRef(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  function handleOpenChange(open: boolean) {
    if (!open) {
      setTab("individual");
      setDetailId(null);
      setDetail(null);
      setDetailError(null);
    }
  }

  async function handleViewSubmission(id: string) {
    setDetailId(id);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    try {
      const res = await getSubmissionDetail(id);
      if ("error" in res) {
        setDetailError(res.error);
      } else {
        setDetail(res.data);
      }
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoadingDetail(false);
    }
  }

  function handleBackToList() {
    setDetailId(null);
    setDetail(null);
    setDetailError(null);
  }

  async function loadReport() {
    if (report || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoadingReport(true);
    setReportError(null);

    try {
      const res = await getProjectSubmissionsReport(projectId);
      if ("error" in res) {
        setReportError(res.error);
      } else {
        setReport(res.data);
        if (res.data.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(res.data[0].id);
        }
      }
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      fetchingRef.current = false;
      setLoadingReport(false);
    }
  }

  function handleTabChange(next: "individual" | "compiled") {
    setTab(next);
    if (next === "compiled") loadReport();
  }

  const selectedTemplate = report?.find((t) => t.id === selectedTemplateId) ?? null;

  return (
    <Dialog onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          <Users className="h-3.5 w-3.5" />
          Preenchimentos públicos
          {count > 0 ? (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {count}
            </Badge>
          ) : null}
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {detailId ? (
              <button
                type="button"
                onClick={handleBackToList}
                className="inline-flex items-center gap-1.5 text-sm font-normal text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para lista
              </button>
            ) : (
              "Preenchimentos públicos"
            )}
          </DialogTitle>
          {!detailId ? (
            <DialogDescription>
              Registro de quem preencheu os checklists de {projectName} via envio de
              checklist.
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {/* Detail view */}
        {detailId ? (
          loadingDetail ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando preenchimento...
            </div>
          ) : detailError ? (
            <div className="space-y-3 py-8 text-center">
              <p className="text-sm text-destructive">{detailError}</p>
              <Button variant="outline" size="sm" onClick={handleBackToList}>
                Voltar
              </Button>
            </div>
          ) : detail ? (
            <SubmissionDetailView detail={detail} />
          ) : null
        ) : submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum preenchimento público até o momento.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Tab switcher */}
            <div className="flex gap-1 rounded-md bg-muted p-1">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === "individual"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => handleTabChange("individual")}
              >
                Por preenchimento
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === "compiled"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => handleTabChange("compiled")}
              >
                Compilado
              </button>
            </div>

            {/* Individual tab */}
            {tab === "individual" ? (
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4">Cliente</th>
                      <th className="py-2 pr-4">E-mail</th>
                      <th className="py-2 pr-4">Formulário</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Enviado em</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((s) => {
                      const tpl = templateById.get(s.template_id);
                      return (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">
                            {s.client_name ?? "—"}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {s.client_email ?? "—"}
                          </td>
                          <td className="py-2 pr-4">
                            {tpl?.name ?? (
                              <span className="text-muted-foreground">(removido)</span>
                            )}
                          </td>
                          <td className="py-2 pr-4">
                            <Badge
                              variant={s.status === "submitted" ? "default" : "secondary"}
                            >
                              {s.status === "submitted" ? "Enviado" : "Rascunho"}
                            </Badge>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {formatDate(s.submitted_at ?? s.created_at)}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleViewSubmission(s.id)}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Ver
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* Compiled tab */}
            {tab === "compiled" ? (
              <div className="space-y-4">
                {loadingReport ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Carregando respostas...
                  </div>
                ) : reportError ? (
                  <p className="py-8 text-center text-sm text-destructive">
                    {reportError}
                  </p>
                ) : report ? (
                  <>
                    {report.length > 1 ? (
                      <Select
                        value={selectedTemplateId}
                        onValueChange={setSelectedTemplateId}
                      >
                        <SelectTrigger className="w-full sm:w-80">
                          <SelectValue placeholder="Selecionar formulário" />
                        </SelectTrigger>
                        <SelectContent>
                          {report.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.discipline_name ? (
                                <span>
                                  <span className="mr-1.5 text-muted-foreground">
                                    {t.discipline_name}
                                  </span>
                                  {t.name}
                                </span>
                              ) : (
                                t.name
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}

                    {selectedTemplate ? (
                      <CompiledView
                        template={selectedTemplate}
                        formatDateShort={formatDateShort}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Selecione um formulário para ver o compilado.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SubmissionDetailView({ detail }: { detail: SubmissionDetail }) {
  const { submission, template, sections, fields, values, matrixValues } = detail;
  const isMatrix = template.layout_mode === "matrix";
  const environments = (template.environments ?? []) as string[];

  const valuesByField = new Map<string, (typeof values)[number]>();
  for (const v of values) valuesByField.set(v.field_id, v);

  const matrixByKey = new Map<string, (typeof matrixValues)[number]>();
  for (const m of matrixValues) matrixByKey.set(`${m.field_id}::${m.env_key}`, m);

  const visibleFields = fields.filter((f) => f.type !== "info");

  const sectionTitles = new Map(sections.map((s) => [s.id, s.title]));

  const groupedFields = visibleFields.reduce<
    { sectionId: string | null; sectionTitle: string; fields: typeof visibleFields }[]
  >((acc, field) => {
    const sId = field.section_id ?? null;
    const existing = acc.find((g) => g.sectionId === sId);
    if (existing) {
      existing.fields.push(field);
    } else {
      acc.push({
        sectionId: sId,
        sectionTitle: sId ? (sectionTitles.get(sId) ?? "") : "",
        fields: [field],
      });
    }
    return acc;
  }, []);

  return (
    <div className="space-y-4">
      {/* Submission meta */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Badge variant={submission.status === "submitted" ? "default" : "secondary"}>
          {submission.status === "submitted" ? "Enviado" : "Rascunho"}
        </Badge>
        <span>
          <strong className="text-foreground">{template.name}</strong>
        </span>
        {submission.client_name ? (
          <span>
            {submission.client_name}
            {submission.client_email ? ` · ${submission.client_email}` : ""}
          </span>
        ) : submission.client_email ? (
          <span>{submission.client_email}</span>
        ) : null}
        <span>
          Enviado em {formatDate(submission.submitted_at ?? submission.created_at)}
        </span>
        {submission.public_link_id ? <Badge variant="outline">Via link</Badge> : null}
      </div>

      {/* Fields */}
      <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
        {groupedFields.map(({ sectionId, sectionTitle, fields: secFields }) => (
          <div key={sectionId ?? "_default"} className="space-y-2">
            {sectionTitle ? (
              <div className="inline-block bg-foreground px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-background">
                {sectionTitle}
              </div>
            ) : null}
            {secFields.map((field) => {
              if (isMatrix) {
                return (
                  <div key={field.id} className="rounded-md border p-3 text-sm">
                    <div className="mb-2 font-medium">
                      <RichTextOr html={field.label} />
                    </div>
                    <dl className="space-y-1 text-xs">
                      {environments.map((env) => {
                        const v = matrixByKey.get(`${field.id}::${env}`);
                        return (
                          <div key={env} className="flex items-baseline gap-2">
                            <dt className="w-28 shrink-0 font-medium uppercase tracking-wide text-muted-foreground">
                              {env}
                            </dt>
                            <dd>
                              {formatFieldValue(field, v?.value ?? null)}
                              {v?.image_url ? (
                                <span className="ml-2 text-muted-foreground">
                                  [imagem anexada]
                                </span>
                              ) : null}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>
                );
              }

              const v = valuesByField.get(field.id);
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-[200px_1fr] items-baseline gap-3 rounded-md border p-3 text-sm"
                >
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <RichTextOr html={field.label} />
                  </dt>
                  <dd>
                    {formatFieldValue(field, v?.value ?? null)}
                    {v?.image_url ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        [imagem: {v.image_url.split("/").pop()}]
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompiledView({
  template,
  formatDateShort,
}: {
  template: ProjectTemplateReport;
  formatDateShort: (iso: string | null) => string;
}) {
  const { fields, sections, submissions } = template;
  const isMatrix = template.layout_mode === "matrix";
  const environments = template.environments ?? [];

  const visibleFields = fields.filter((f) => f.type !== "info");

  if (submissions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum preenchimento para este formulário.
      </p>
    );
  }

  const sectionTitles = new Map(sections.map((s) => [s.id, s.title]));

  const groupedFields = visibleFields.reduce<
    { sectionId: string | null; sectionTitle: string; fields: typeof visibleFields }[]
  >((acc, field) => {
    const sId = field.section_id ?? null;
    const existing = acc.find((g) => g.sectionId === sId);
    if (existing) {
      existing.fields.push(field);
    } else {
      acc.push({
        sectionId: sId,
        sectionTitle: sId ? (sectionTitles.get(sId) ?? "") : "",
        fields: [field],
      });
    }
    return acc;
  }, []);

  return (
    <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
      {/* Respondents header */}
      <div className="rounded-md border bg-muted/40 p-3">
        <p className="text-xs font-medium text-muted-foreground">
          {submissions.length} {submissions.length === 1 ? "respondente" : "respondentes"}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {submissions.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs"
            >
              <span className="font-medium">
                {s.client_name ?? s.client_email ?? "—"}
              </span>
              <span className="text-muted-foreground">
                {formatDateShort(s.submitted_at)}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Fields */}
      {groupedFields.map(({ sectionId, sectionTitle, fields: secFields }) => (
        <div key={sectionId ?? "_default"} className="space-y-2">
          {sectionTitle ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {sectionTitle}
            </p>
          ) : null}

          {secFields.map((field) => {
            if (isMatrix) {
              return (
                <div key={field.id} className="rounded-md border p-3 text-sm">
                  <div className="mb-2 font-medium">
                    <RichTextOr html={field.label} />
                  </div>
                  <div className="space-y-3">
                    {environments.map((env) => (
                      <div key={env}>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {env}
                        </p>
                        <div className="space-y-1">
                          {submissions.map((s) => {
                            const mv = s.matrixValues.find(
                              (m) => m.field_id === field.id && m.env_key === env,
                            );
                            return (
                              <div
                                key={s.id}
                                className="grid grid-cols-[160px_1fr] items-baseline gap-2 text-xs"
                              >
                                <span className="truncate text-muted-foreground">
                                  {s.client_name ?? s.client_email ?? "—"}
                                </span>
                                <span>{formatFieldValue(field, mv?.value ?? null)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div key={field.id} className="rounded-md border p-3 text-sm">
                <div className="mb-2 font-medium">
                  <RichTextOr html={field.label} />
                </div>
                <div className="space-y-1">
                  {submissions.map((s) => {
                    const val = s.values.find((v) => v.field_id === field.id);
                    return (
                      <div
                        key={s.id}
                        className="grid grid-cols-[160px_1fr] items-baseline gap-2 text-xs"
                      >
                        <span className="truncate text-muted-foreground">
                          {s.client_name ?? s.client_email ?? "—"}
                        </span>
                        <span>
                          {formatFieldValue(field, val?.value ?? null)}
                          {val?.image_url ? (
                            <span className="ml-1 text-muted-foreground">[imagem]</span>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
