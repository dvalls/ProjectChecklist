"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";

import { TableValueView } from "@/components/forms/table-value-view";
import { Button } from "@/components/ui/button";
import { RichTextOr } from "@/components/rich-text";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ClFormSection } from "@/lib/supabase/types";

import { tableHasVisibleText } from "@/lib/forms/table";

import { getPublicSessionSummary, type PublicSubmissionSummary } from "./actions";
import { DownloadSessionPdfButton } from "./pdf/download-buttons";
import { formatFieldValue } from "./pdf/format-value";

interface Props {
  token: string;
  submissionIds: string[];
  clientName: string | null;
  projectName?: string;
}

export function PublicSubmissionSummaryDialog({
  token,
  submissionIds,
  clientName,
  projectName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<PublicSubmissionSummary[] | null>(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (!open || summaries || fetchingRef.current) return;

    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    getPublicSessionSummary(token, submissionIds)
      .then((res) => {
        if ("error" in res && res.error) {
          setError(res.error);
          return;
        }
        if ("data" in res && res.data) {
          setSummaries(res.data);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Erro ao carregar.");
      })
      .finally(() => {
        fetchingRef.current = false;
        setLoading(false);
      });
  }, [open, summaries, token, submissionIds]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-primary hover:text-primary"
        onClick={() => setOpen(true)}
      >
        <FileText className="mr-1 h-3.5 w-3.5" />
        Ver resumo
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
          <DialogHeader className="flex flex-row items-center justify-between gap-3 pr-8">
            <DialogTitle>Resumo das respostas</DialogTitle>
            {summaries && summaries.length > 0 ? (
              <DownloadSessionPdfButton
                token={token}
                submissionIds={submissionIds}
                clientName={clientName}
                projectName={projectName}
              />
            ) : null}
          </DialogHeader>

          <div className="-mx-6 max-h-[70vh] overflow-y-auto px-6 pb-2">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : error ? (
              <p className="py-8 text-center text-sm text-destructive">{error}</p>
            ) : summaries ? (
              <div className="space-y-8">
                {summaries.map((summary) => (
                  <SummaryContent key={summary.submission.id} summary={summary} />
                ))}
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function isFilled(value: string | null | undefined, imageUrl: string | null | undefined) {
  return (value !== null && value !== undefined && value !== "") || !!imageUrl;
}

function SummaryContent({ summary }: { summary: PublicSubmissionSummary }) {
  const { template, sections, fields, values, matrixValues } = summary;

  const valuesByField = new Map(values.map((v) => [v.field_id, v] as const));
  const matrixByKey = new Map(
    matrixValues.map((v) => [`${v.field_id}::${v.env_key}`, v] as const),
  );

  const isMatrix = template.layout_mode === "matrix";
  const environments = (template.environments ?? []) as string[];

  const sectionsToRender: ClFormSection[] =
    sections.length > 0
      ? sections
      : [
          {
            id: "_default",
            template_id: "",
            title: "",
            subtitle: null,
            columns: 3,
            position: 0,
            created_at: "",
          },
        ];

  const answerVisible = (
    field: PublicSubmissionSummary["fields"][number],
    value: string | null | undefined,
    imageUrl: string | null | undefined,
  ) => {
    if (field.type === "table") return tableHasVisibleText(field, value ?? null);
    return isFilled(value, imageUrl);
  };

  const fieldHasAnswer = (field: PublicSubmissionSummary["fields"][number]) => {
    if (isMatrix) {
      return environments.some((env) => {
        const v = matrixByKey.get(`${field.id}::${env}`);
        return answerVisible(field, v?.value, v?.image_url);
      });
    }
    const v = valuesByField.get(field.id);
    return answerVisible(field, v?.value, v?.image_url);
  };

  const renderedSections = sectionsToRender
    .map((section) => {
      const secFields =
        sections.length > 0 ? fields.filter((f) => f.section_id === section.id) : fields;
      const visible = secFields.filter((f) => f.type !== "info" && fieldHasAnswer(f));
      if (visible.length === 0) return null;
      return { section, visible };
    })
    .filter((x): x is { section: ClFormSection; visible: typeof fields } => Boolean(x));

  if (renderedSections.length === 0) return null;

  return (
    <div className="space-y-4">
      {renderedSections.map(({ section, visible }) => (
        <section key={section.id} className="space-y-2">
          {section.title ? (
            <div className="text-sm font-semibold uppercase tracking-wide text-foreground">
              {section.title}
            </div>
          ) : null}

          <div className="space-y-2">
            {visible.map((field) => {
              if (isMatrix) {
                const filledEnvs = environments.filter((env) => {
                  const v = matrixByKey.get(`${field.id}::${env}`);
                  return answerVisible(field, v?.value, v?.image_url);
                });
                if (field.type === "table") {
                  return (
                    <div
                      key={field.id}
                      className="space-y-2 rounded-md border p-3 text-sm"
                    >
                      <div className="font-medium">
                        <RichTextOr html={field.label} />
                      </div>
                      {filledEnvs.map((env) => {
                        const v = matrixByKey.get(`${field.id}::${env}`);
                        return (
                          <div key={env} className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {env}
                            </p>
                            <TableValueView field={field} raw={v?.value ?? null} />
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                return (
                  <div key={field.id} className="rounded-md border p-3 text-sm">
                    <div className="font-medium">
                      <RichTextOr html={field.label} />
                    </div>
                    <dl className="mt-2 grid gap-1 text-xs">
                      {filledEnvs.map((env) => {
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
                                  [imagem]
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
              if (field.type === "table") {
                return (
                  <div key={field.id} className="space-y-2 rounded-md border p-3 text-sm">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <RichTextOr html={field.label} />
                    </div>
                    <TableValueView field={field} raw={v?.value ?? null} />
                  </div>
                );
              }
              return (
                <div
                  key={field.id}
                  className="grid grid-cols-[140px_1fr] items-baseline gap-3 rounded-md border px-3 py-1.5 text-sm sm:grid-cols-[200px_1fr]"
                >
                  <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <RichTextOr html={field.label} />
                  </dt>
                  <dd className="leading-tight">
                    {formatFieldValue(field, v?.value ?? null)}
                    {v?.image_url ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        [imagem anexada]
                      </span>
                    ) : null}
                  </dd>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
