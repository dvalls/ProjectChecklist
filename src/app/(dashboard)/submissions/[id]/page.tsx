import { notFound } from "next/navigation";

import { TableValueView } from "@/components/forms/table-value-view";
import { BackLink } from "@/components/layout/back-link";
import { EmptyState } from "@/components/layout/empty-state";
import { RichTextOr } from "@/components/rich-text";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type {
  ClFormField,
  ClFormSection,
  ClFormSubmission,
  ClFormTemplate,
  ClSubmissionValue,
  ClSubmissionValueMatrix,
  FieldOptions,
} from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

function formatDate(iso: string | null) {
  return formatDateTime(iso) || "—";
}

function renderValue(field: ClFormField, raw: string | null): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  const opts = (field.options as Exclude<FieldOptions, null>) ?? {};
  const choices = opts.choices ?? [];

  if (field.type === "checkbox") {
    return raw === "true" ? "Sim" : "Não";
  }

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
    const choice = choices.find((c) => c.value === raw);
    return choice?.label ?? raw;
  }

  return raw;
}

export default async function SubmissionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: submission } = await supabase
    .from("cl_form_submissions")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!submission) notFound();

  const typedSubmission = submission as ClFormSubmission;

  const [
    { data: template },
    { data: sections },
    { data: fields },
    { data: values },
    { data: matrixValues },
  ] = await Promise.all([
    supabase
      .from("cl_form_templates")
      .select("*")
      .eq("id", typedSubmission.template_id)
      .maybeSingle(),
    supabase
      .from("cl_form_sections")
      .select("*")
      .eq("template_id", typedSubmission.template_id)
      .order("position"),
    supabase
      .from("cl_form_fields")
      .select("*")
      .eq("template_id", typedSubmission.template_id)
      .order("position"),
    supabase.from("cl_submission_values").select("*").eq("submission_id", params.id),
    supabase
      .from("cl_submission_values_matrix")
      .select("*")
      .eq("submission_id", params.id),
  ]);

  if (!template) notFound();

  const typedTemplate = template as ClFormTemplate;
  const typedSections = (sections ?? []) as ClFormSection[];
  const typedFields = (fields ?? []) as ClFormField[];
  const typedValues = (values ?? []) as ClSubmissionValue[];
  const typedMatrix = (matrixValues ?? []) as ClSubmissionValueMatrix[];

  const valuesByField = new Map<string, ClSubmissionValue>();
  for (const v of typedValues) valuesByField.set(v.field_id, v);

  const matrixByKey = new Map<string, ClSubmissionValueMatrix>();
  for (const v of typedMatrix) {
    matrixByKey.set(`${v.field_id}::${v.env_key}`, v);
  }

  const isMatrix = typedTemplate.layout_mode === "matrix";
  const environments = (typedTemplate.environments ?? []) as string[];

  const backHref = `/templates/${typedTemplate.id}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <BackLink href={backHref}>Voltar para o template</BackLink>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{typedTemplate.name}</CardTitle>
          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
            <Badge
              variant={typedSubmission.status === "submitted" ? "default" : "secondary"}
            >
              {typedSubmission.status === "submitted" ? "Enviado" : "Rascunho"}
            </Badge>
            <span>
              Enviado em{" "}
              {formatDate(typedSubmission.submitted_at ?? typedSubmission.created_at)}
            </span>
            {typedSubmission.client_name ? (
              <span>
                Cliente: <strong>{typedSubmission.client_name}</strong>
                {typedSubmission.client_email ? ` (${typedSubmission.client_email})` : ""}
              </span>
            ) : null}
            {typedSubmission.public_link_id ? (
              <Badge variant="outline">Preenchido via link de envio</Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {typedSections.length === 0 && typedFields.length === 0 ? (
            <EmptyState
              title="Sem respostas"
              description="Esta submissão não contém respostas registradas."
            />
          ) : (
            (typedSections.length > 0
              ? typedSections
              : [
                  {
                    id: "_default",
                    template_id: "",
                    title: "",
                    subtitle: null,
                    columns: 3 as const,
                    position: 0,
                    created_at: "",
                  },
                ]
            ).map((section) => {
              const secFields =
                typedSections.length > 0
                  ? typedFields.filter((f) => f.section_id === section.id)
                  : typedFields;
              if (secFields.length === 0) return null;
              return (
                <section key={section.id} className="space-y-3">
                  {section.title ? (
                    <div className="inline-block bg-foreground px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-background">
                      {section.title}
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    {secFields.map((field) => {
                      if (field.type === "info") return null;

                      if (field.type === "table") {
                        return (
                          <div
                            key={field.id}
                            className="space-y-2 rounded-md border p-3 text-sm"
                          >
                            <div className="font-medium">
                              <RichTextOr html={field.label} />
                            </div>
                            {isMatrix ? (
                              environments.map((env) => {
                                const v = matrixByKey.get(`${field.id}::${env}`);
                                return (
                                  <div key={env} className="space-y-1">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      {env}
                                    </p>
                                    <TableValueView
                                      field={field}
                                      raw={v?.value ?? null}
                                    />
                                  </div>
                                );
                              })
                            ) : (
                              <TableValueView
                                field={field}
                                raw={valuesByField.get(field.id)?.value ?? null}
                              />
                            )}
                          </div>
                        );
                      }

                      if (isMatrix) {
                        return (
                          <div key={field.id} className="rounded-md border p-3 text-sm">
                            <div className="font-medium">
                              <RichTextOr html={field.label} />
                            </div>
                            <dl className="mt-2 grid gap-1 text-xs">
                              {environments.map((env) => {
                                const v = matrixByKey.get(`${field.id}::${env}`);
                                return (
                                  <div key={env} className="flex items-baseline gap-2">
                                    <dt className="w-28 shrink-0 font-medium uppercase tracking-wide text-muted-foreground">
                                      {env}
                                    </dt>
                                    <dd>
                                      {renderValue(field, v?.value ?? null)}
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
                            {renderValue(field, v?.value ?? null)}
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
                </section>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
