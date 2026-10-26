"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { FieldInputControl } from "@/components/form-builder/field-input";
import { PhotoHintButton } from "@/components/form-builder/photo-hint-button";
import {
  EqualizeColumnSelect,
  matrixEnvCellClass,
  matrixEnvHeadClass,
  matrixLabelCellClass,
  matrixLabelShadowClass,
  matrixTableClass,
  MatrixPanScroll,
  useHorizontalScrollSync,
} from "@/components/forms/matrix-tools";
import { FieldHelpText, RichTextOr } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { fieldPlainLabel } from "@/lib/rich-text";
import type {
  ClFormField,
  ClFormSection,
  ClFormTemplate,
  FieldOptions,
} from "@/lib/supabase/types";

import {
  type FieldValue,
  type SubmissionMatrixValueInput,
  type SubmissionValueInput,
} from "@/lib/forms/types";
import {
  evaluateVisible,
  type EnvLinks,
  isDisplayOnly,
  linkEnvironment,
  makeFieldKey,
  parseCheckboxGroup,
  splitFieldKey,
  syncLinkedField,
} from "@/lib/forms/utils";

import { createSubmission } from "@/app/(dashboard)/submissions/actions";

interface Props {
  template: ClFormTemplate;
  sections: ClFormSection[];
  fields: ClFormField[];
}

export function SubmissionForm({ template, sections, fields }: Props) {
  const isMatrix = template.layout_mode === "matrix";
  const environments = useMemo(
    () => (template.environments ?? []) as string[],
    [template.environments],
  );

  const envScope = useMemo(
    () => (isMatrix ? environments : [undefined as string | undefined]),
    [isMatrix, environments],
  );

  const initialValues = useMemo<Record<string, FieldValue>>(() => {
    const out: Record<string, FieldValue> = {};
    for (const f of fields) {
      if (isDisplayOnly(f.type)) continue;
      for (const env of envScope) {
        out[makeFieldKey(f.id, env)] = {
          value: f.type === "checkbox" ? "false" : null,
        };
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, isMatrix]);

  const [values, setValues] = useState<Record<string, FieldValue>>(initialValues);
  const [links, setLinks] = useState<EnvLinks>({});
  const linksRef = useRef(links);
  linksRef.current = links;
  const [isSubmitting, startSubmitting] = useTransition();
  const scrollSync = useHorizontalScrollSync();

  function setFieldValue(key: string, patch: Partial<FieldValue>) {
    setValues((prev) => {
      const next = { ...prev, [key]: { ...prev[key], ...patch } };
      const { fieldId, env } = splitFieldKey(key);
      if (!env) return next;
      return syncLinkedField({
        fields,
        values: next,
        environments,
        links: linksRef.current,
        editedEnv: env,
        fieldId,
      });
    });
  }

  function linkColumn(target: string, source: string | null) {
    const nextLinks = linkEnvironment(linksRef.current, target, source);
    linksRef.current = nextLinks;
    setLinks(nextLinks);
    if (!source) return;
    setValues((prev) =>
      syncLinkedField({
        fields,
        values: prev,
        environments,
        links: nextLinks,
        editedEnv: target,
      }),
    );
    toast.success(`"${target}" igualado a "${source}".`);
  }

  function handleSubmit(asDraft: boolean) {
    if (!template.project_id) {
      toast.error(
        "Templates da biblioteca não podem ser respondidos. Importe-o em um projeto primeiro.",
      );
      return;
    }
    const projectId = template.project_id;
    const inputs: SubmissionValueInput[] = [];
    const matrixInputs: SubmissionMatrixValueInput[] = [];

    for (const env of envScope) {
      for (const f of fields) {
        if (isDisplayOnly(f.type)) continue;
        const key = makeFieldKey(f.id, env);
        const v = values[key];
        const visible = evaluateVisible(f.visible_when, values, env);

        if (f.required && visible && !asDraft) {
          const missing =
            f.type === "checkbox"
              ? v?.value !== "true"
              : f.type === "checkbox_group"
                ? (() => {
                    const parsed = parseCheckboxGroup(v?.value ?? null);
                    return parsed.selected.length === 0 && !parsed.other;
                  })()
                : !v?.value;
          if (missing) {
            toast.error(
              `${fieldPlainLabel(f.label, "Campo")}${env ? ` (${env})` : ""}: obrigatório.`,
            );
            return;
          }
        }

        if (!visible) continue;

        const payload = {
          field_id: f.id,
          value: v?.value ?? null,
          image_url: null,
        };

        if (env) {
          matrixInputs.push({ ...payload, env_key: env });
        } else {
          inputs.push(payload);
        }
      }
    }

    startSubmitting(async () => {
      const res = await createSubmission({
        template_id: template.id,
        project_id: projectId,
        values: inputs,
        matrix_values: matrixInputs,
        asDraft,
      });

      if (res?.error) {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg sm:text-xl">{template.name}</CardTitle>
        {template.description ? (
          <p className="text-sm text-muted-foreground">{template.description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-8 p-4 pt-0 sm:p-6 sm:pt-0">
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este formulário não possui campos.
          </p>
        ) : isMatrix ? (
          <MatrixRenderer
            sections={sections}
            fields={fields}
            environments={environments}
            values={values}
            onChange={setFieldValue}
            panEnabled={false}
            scrollSync={scrollSync}
            scrolled={scrollSync.edge === "mid" || scrollSync.edge === "end"}
            links={links}
            onLink={linkColumn}
          />
        ) : (
          <StandardRenderer
            sections={sections}
            fields={fields}
            values={values}
            onChange={setFieldValue}
          />
        )}

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Salvar rascunho
          </Button>
          <Button
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            <Send className="mr-2 h-4 w-4" />
            {isSubmitting ? "Enviando..." : "Enviar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StandardRenderer({
  sections,
  fields,
  values,
  onChange,
}: {
  sections: ClFormSection[];
  fields: ClFormField[];
  values: Record<string, FieldValue>;
  onChange: (key: string, patch: Partial<FieldValue>) => void;
}) {
  const sectionList =
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
          } satisfies ClFormSection,
        ];

  return (
    <div className="space-y-8">
      {sectionList.map((section) => {
        const sectionFields =
          sections.length > 0
            ? fields.filter((f) => f.section_id === section.id)
            : fields;
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
              {sectionFields.map((field) => {
                const key = makeFieldKey(field.id);
                const visible = evaluateVisible(field.visible_when, values);
                if (!visible) return null;
                return (
                  <div
                    key={field.id}
                    className="min-w-0 sm:[grid-column:var(--field-span)]"
                    style={
                      {
                        "--field-span": `span ${Math.min(
                          field.column_span,
                          section.columns,
                        )}`,
                      } as React.CSSProperties
                    }
                  >
                    <FieldInputControl
                      field={field}
                      value={values[key]}
                      onChange={(patch) => onChange(key, patch)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MatrixRenderer({
  sections,
  fields,
  environments,
  values,
  onChange,
  panEnabled,
  scrollSync,
  scrolled,
  links,
  onLink,
}: {
  sections: ClFormSection[];
  fields: ClFormField[];
  environments: string[];
  values: Record<string, FieldValue>;
  onChange: (key: string, patch: Partial<FieldValue>) => void;
  panEnabled: boolean;
  scrollSync: ReturnType<typeof useHorizontalScrollSync>;
  scrolled: boolean;
  links: EnvLinks;
  onLink: (target: string, source: string | null) => void;
}) {
  const rows = fields.filter((f) => !isDisplayOnly(f.type));

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const secRows = rows.filter((f) => f.section_id === section.id);
        if (secRows.length === 0) return null;
        return (
          <div key={section.id} className="space-y-2">
            {section.title ? (
              <div className="inline-block bg-foreground px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-background">
                {section.title}
              </div>
            ) : null}
            <MatrixPanScroll
              panEnabled={panEnabled}
              register={scrollSync.register}
              onScrollSync={scrollSync.onScroll}
              publish={scrollSync.publish}
            >
              <table className={matrixTableClass}>
                <thead>
                  <tr className="select-none">
                    <th
                      className={
                        matrixLabelCellClass +
                        " text-left text-xs italic text-muted-foreground" +
                        (scrolled ? " " + matrixLabelShadowClass : "")
                      }
                    >
                      Ambiente
                    </th>
                    {environments.map((env) => (
                      <th key={env} className={matrixEnvHeadClass}>
                        <div className="break-words leading-snug">{env}</div>
                        {environments.length > 1 ? (
                          <EqualizeColumnSelect
                            env={env}
                            environments={environments}
                            linkedTo={links[env] ?? null}
                            onChange={(source) => onLink(env, source)}
                          />
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {secRows.map((field) => {
                    const fieldOpts =
                      (field.options as Exclude<FieldOptions, null>) ?? {};
                    const fieldImage = fieldOpts.image_url ?? null;
                    return (
                      <tr key={field.id} className="align-top">
                        <td
                          className={
                            matrixLabelCellClass +
                            " text-sm" +
                            (scrolled ? " " + matrixLabelShadowClass : "")
                          }
                        >
                          <div className="flex flex-wrap items-start gap-1.5 font-medium">
                            <RichTextOr
                              html={field.label}
                              className="text-sm leading-snug"
                            />
                            {field.required ? (
                              <span className="text-destructive-foreground">*</span>
                            ) : null}
                            {fieldImage ? (
                              <PhotoHintButton
                                imagePath={fieldImage}
                                caption={fieldOpts.image_caption ?? null}
                                alt={fieldPlainLabel(field.label, "Foto de apoio")}
                                size="xs"
                              />
                            ) : null}
                          </div>
                          <FieldHelpText html={field.help_text} />
                        </td>
                        {environments.map((env) => {
                          const key = makeFieldKey(field.id, env);
                          const visible = evaluateVisible(
                            field.visible_when,
                            values,
                            env,
                          );
                          const mirrored = Boolean(links[env]);
                          return (
                            <td key={env} className={matrixEnvCellClass}>
                              {visible ? (
                                <fieldset
                                  disabled={mirrored}
                                  className="m-0 min-w-0 border-0 p-0 disabled:opacity-100"
                                >
                                  <FieldInputControl
                                    field={field}
                                    value={values[key]}
                                    compact
                                    radioGroupName={key}
                                    onChange={(patch) => onChange(key, patch)}
                                  />
                                </fieldset>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </MatrixPanScroll>
          </div>
        );
      })}
    </div>
  );
}
