"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, Lock, Search, X } from "lucide-react";
import { toast } from "sonner";

import {
  readDraftSubmission,
  type DraftSubmissionMatrixValue,
  type DraftSubmissionValue,
  writeDraftSubmission,
  writeDraftProgress,
} from "./draft-progress";

import { ImageDisplayField } from "@/components/form-builder/field-preview";
import { PhotoHintButton } from "@/components/form-builder/photo-hint-button";
import { FieldHelpText, RichTextOr } from "@/components/rich-text";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type {
  ClFormField,
  ClFormSection,
  ClFormTemplate,
  FieldOptions,
} from "@/lib/supabase/types";

import type { CheckboxGroupValue, FieldValue } from "@/lib/forms/types";
import { fieldPlainLabel, plainTextFromHtml } from "@/lib/rich-text";
import {
  evaluateVisible,
  type EnvLinks,
  isDisplayOnly,
  isFieldAnswered,
  linkEnvironment,
  linksFromDraft,
  makeFieldKey,
  parseCheckboxGroup,
  splitFieldKey,
  syncLinkedField,
  parseRadioOther,
  serializeCheckboxGroup,
  serializeRadioOther,
} from "@/lib/forms/utils";

import type {
  PreviousMatrixValuesMap,
  PreviousValuesMap,
} from "./forms/[templateId]/public-fill-wrapper";

interface Props {
  token: string;
  template: ClFormTemplate;
  sections: ClFormSection[];
  fields: ClFormField[];
  identity: { client_name: string; client_email: string };
  previousByField?: PreviousValuesMap;
  previousByMatrix?: PreviousMatrixValuesMap;
  allowResubmit?: boolean;
  preview?: boolean;
}

type FieldFilter = "all" | "unfilled" | "new" | "filled";

export function PublicFormsFlow({
  token,
  template,
  sections,
  fields,
  identity,
  previousByField,
  previousByMatrix,
  allowResubmit = false,
  preview = false,
}: Props) {
  const clientName = identity.client_name;
  const clientEmail = identity.client_email;

  return (
    <PublicSubmissionForm
      token={token}
      template={template}
      sections={sections}
      fields={fields}
      clientName={clientName}
      clientEmail={clientEmail}
      previousByField={previousByField ?? {}}
      previousByMatrix={previousByMatrix ?? {}}
      allowResubmit={allowResubmit}
      preview={preview}
    />
  );
}

function PublicSubmissionForm({
  token,
  template,
  sections,
  fields,
  clientName,
  clientEmail,
  previousByField,
  previousByMatrix,
  allowResubmit,
  preview,
}: {
  token: string;
  template: ClFormTemplate;
  sections: ClFormSection[];
  fields: ClFormField[];
  clientName: string;
  clientEmail: string;
  previousByField: PreviousValuesMap;
  previousByMatrix: PreviousMatrixValuesMap;
  allowResubmit: boolean;
  preview: boolean;
}) {
  const isMatrix = template.layout_mode === "matrix";
  const environments = useMemo(
    () => (template.environments ?? []) as string[],
    [template.environments],
  );

  const envScope = useMemo(
    () => (isMatrix ? environments : [undefined as string | undefined]),
    [environments, isMatrix],
  );

  function getPrevious(fieldId: string, env: string | undefined) {
    if (preview) return undefined;
    if (env) {
      return previousByMatrix[fieldId]?.[env];
    }
    return previousByField[fieldId];
  }

  const initialValues = useMemo<Record<string, FieldValue>>(() => {
    const savedDraft = preview
      ? null
      : readDraftSubmission(token, template.id, clientEmail);
    const savedValues = new Map(
      savedDraft?.values.map((v) => [makeFieldKey(v.field_id), v.value]) ?? [],
    );
    const savedMatrixValues = new Map(
      savedDraft?.matrix_values.map((v) => [
        makeFieldKey(v.field_id, v.env_key),
        v.value,
      ]) ?? [],
    );
    const out: Record<string, FieldValue> = {};
    for (const f of fields) {
      if (isDisplayOnly(f.type)) continue;
      for (const env of envScope) {
        const saved = env
          ? savedMatrixValues.get(makeFieldKey(f.id, env))
          : savedValues.get(makeFieldKey(f.id));
        const prev = getPrevious(f.id, env);
        if (saved !== undefined && (allowResubmit || !prev)) {
          out[makeFieldKey(f.id, env)] = { value: saved };
        } else if (prev && prev.value !== null) {
          out[makeFieldKey(f.id, env)] = { value: prev.value };
        } else {
          out[makeFieldKey(f.id, env)] = {
            value: f.type === "checkbox" ? "false" : null,
          };
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fields,
    isMatrix,
    preview,
    token,
    template.id,
    clientEmail,
    allowResubmit,
    previousByField,
    previousByMatrix,
  ]);

  const [values, setValues] = useState<Record<string, FieldValue>>(initialValues);
  const [links, setLinks] = useState<EnvLinks>(() => {
    if (preview) return {};
    return linksFromDraft(
      readDraftSubmission(token, template.id, clientEmail)?.env_links,
      (template.environments ?? []) as string[],
    );
  });
  const linksRef = useRef(links);
  linksRef.current = links;
  const [filter, setFilter] = useState<FieldFilter>("all");
  const [search, setSearch] = useState("");
  const scrollSync = useHorizontalScrollSync();

  function isCellLocked(fieldId: string, env: string) {
    return !allowResubmit && Boolean(previousByMatrix[fieldId]?.[env]);
  }

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
        isTargetLocked: isCellLocked,
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
        isTargetLocked: isCellLocked,
      }),
    );
    toast.success(`"${target}" igualado a "${source}".`);
  }

  const hasAnyPrevious = useMemo(() => {
    for (const f of fields) {
      if (isDisplayOnly(f.type)) continue;
      for (const env of envScope) {
        if (getPrevious(f.id, env)) return true;
      }
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, isMatrix, previousByField, previousByMatrix]);

  const progress = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const env of envScope) {
      for (const f of fields) {
        if (isDisplayOnly(f.type)) continue;
        if (!f.required) continue;
        total += 1;
        const key = makeFieldKey(f.id, env);
        const visible = evaluateVisible(f.visible_when, values, env);
        if (!visible) {
          done += 1;
          continue;
        }
        if (isFieldAnswered(f, values[key])) {
          done += 1;
        }
      }
    }
    return { done, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, values, envScope]);

  const allProgress = useMemo(() => {
    let totalAll = 0;
    let doneAll = 0;
    let newCount = 0;
    for (const env of envScope) {
      for (const f of fields) {
        if (isDisplayOnly(f.type)) continue;
        const visible = evaluateVisible(f.visible_when, values, env);
        if (!visible) continue;
        totalAll += 1;
        const key = makeFieldKey(f.id, env);
        const prev = env ? previousByMatrix[f.id]?.[env] : previousByField[f.id];
        const locked = Boolean(prev) && !allowResubmit;
        if (locked || isFieldAnswered(f, values[key])) {
          doneAll += 1;
        }
        if (!locked && isFieldAnswered(f, values[key])) {
          newCount += 1;
        }
      }
    }
    return { doneAll, totalAll, newCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, values, envScope, previousByField, previousByMatrix, allowResubmit]);

  const filterCounts = useMemo(
    () => ({
      all: allProgress.totalAll,
      new: allProgress.newCount,
      filled: allProgress.doneAll,
      unfilled: allProgress.totalAll - allProgress.doneAll,
    }),
    [allProgress],
  );

  const hasQuestions = useMemo(
    () => fields.some((field) => !isDisplayOnly(field.type)),
    [fields],
  );

  const draftSubmission = useMemo(() => {
    const inputs: DraftSubmissionValue[] = [];
    const matrixInputs: DraftSubmissionMatrixValue[] = [];
    for (const env of envScope) {
      for (const f of fields) {
        if (isDisplayOnly(f.type)) continue;
        const key = makeFieldKey(f.id, env);
        const v = values[key];
        const visible = evaluateVisible(f.visible_when, values, env);

        if (f.required && visible) {
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
            continue;
          }
        }

        if (!visible) continue;

        const prev = getPrevious(f.id, env);
        const locked = Boolean(prev) && !allowResubmit;
        const payload = {
          field_id: f.id,
          value: locked ? (prev?.value ?? null) : (v?.value ?? null),
          image_url: locked ? (prev?.image_url ?? null) : null,
        };

        if (env) {
          matrixInputs.push({ ...payload, env_key: env });
        } else {
          inputs.push(payload);
        }
      }
    }
    return {
      values: inputs,
      matrix_values: matrixInputs,
      env_links: Object.entries(links).map(([target, source]) => ({ target, source })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, values, links, envScope, allowResubmit, previousByField, previousByMatrix]);

  useEffect(() => {
    if (preview) return;
    writeDraftProgress(token, template.id, clientEmail, {
      done: progress.done,
      total: progress.total,
      doneAll: allProgress.doneAll,
      totalAll: allProgress.totalAll,
    });
    writeDraftSubmission(token, template.id, clientEmail, draftSubmission);
  }, [preview, progress, allProgress, draftSubmission, token, template.id, clientEmail]);

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg sm:text-xl">{template.name}</CardTitle>
        {template.description ? (
          <p className="break-words text-sm text-muted-foreground">
            {template.description}
          </p>
        ) : null}
        {preview ? null : (
          <p className="break-words pt-2 text-xs text-muted-foreground">
            Respondendo como <strong>{clientName}</strong> ({clientEmail})
          </p>
        )}
        {progress.total > 0 ? (
          <p className="pt-1 text-xs text-muted-foreground">
            Obrigatórios:{" "}
            <strong
              className={
                progress.done >= progress.total
                  ? "text-success-foreground"
                  : "text-foreground"
              }
            >
              {progress.done}/{progress.total}
            </strong>
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6 p-4 pt-0 sm:p-6 sm:pt-0">
        {hasAnyPrevious ? (
          <div
            className={
              "flex items-start gap-2 rounded-md border p-3 text-xs " +
              (allowResubmit
                ? "border-warning bg-warning/30 text-warning-foreground"
                : "border-muted-foreground/20 bg-muted/40 text-muted-foreground")
            }
          >
            {allowResubmit ? (
              <History className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p>
              {allowResubmit
                ? "Alguns campos já foram respondidos em preenchimentos anteriores e vêm pré-preenchidos. Você pode alterá-los se necessário."
                : "Alguns campos já foram respondidos em preenchimentos anteriores e estão bloqueados. Para alterar, peça ao responsável para habilitar novo preenchimento nas configurações do projeto."}
            </p>
          </div>
        ) : null}

        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Este formulário não possui campos.
          </p>
        ) : (
          <>
            {hasQuestions ? (
              <FilterBar
                filter={filter}
                counts={filterCounts}
                onChange={setFilter}
                search={search}
                onSearchChange={setSearch}
              />
            ) : null}
            {isMatrix ? (
              <MatrixRenderer
                sections={sections}
                fields={fields}
                environments={environments}
                values={values}
                onChange={setFieldValue}
                previousByMatrix={previousByMatrix}
                allowResubmit={allowResubmit}
                filter={filter}
                search={search}
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
                previousByField={previousByField}
                allowResubmit={allowResubmit}
                filter={filter}
                search={search}
              />
            )}
            {filter !== "all" && filterCounts[filter] === 0 ? (
              <p className="rounded-md border border-dashed bg-muted/20 p-4 text-center text-sm text-muted-foreground">
                {filter === "filled"
                  ? "Nenhum item preenchido até o momento."
                  : filter === "new"
                    ? "Nenhum item sendo preenchido no momento."
                    : "Todos os itens estão preenchidos."}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StandardRenderer({
  sections,
  fields,
  values,
  onChange,
  previousByField,
  allowResubmit,
  filter,
  search,
}: {
  sections: ClFormSection[];
  fields: ClFormField[];
  values: Record<string, FieldValue>;
  onChange: (key: string, patch: Partial<FieldValue>) => void;
  previousByField: PreviousValuesMap;
  allowResubmit: boolean;
  filter: FieldFilter;
  search: string;
}) {
  const needle = search.trim().toLowerCase();
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
        const filteredFields = sectionFields.filter((field) => {
          const visible = evaluateVisible(field.visible_when, values);
          if (!visible) return false;
          if (needle) {
            const label = fieldPlainLabel(field.label).toLowerCase();
            const help = plainTextFromHtml(field.help_text).toLowerCase();
            if (!label.includes(needle) && !help.includes(needle)) return false;
          }
          if (filter === "all") return true;
          if (isDisplayOnly(field.type)) return false;
          const key = makeFieldKey(field.id);
          const locked = Boolean(previousByField[field.id]) && !allowResubmit;
          const answered = isFieldAnswered(field, values[key]);
          if (filter === "new") return !locked && answered;
          if (filter === "filled") return locked || answered;
          return !locked && !answered;
        });
        if (filteredFields.length === 0) return null;
        return (
          <section key={section.id} className="space-y-3">
            {section.title ? (
              <div className="border-b pb-1">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.title}
                </h2>
                {section.subtitle ? (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    {section.subtitle}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div
              className="grid grid-cols-1 gap-4 md:[grid-template-columns:var(--section-columns)]"
              style={
                {
                  "--section-columns": `repeat(${section.columns}, minmax(0, 1fr))`,
                } as React.CSSProperties
              }
            >
              {filteredFields.map((field) => {
                const key = makeFieldKey(field.id);
                const hasPrevious = Boolean(previousByField[field.id]);
                const locked = hasPrevious && !allowResubmit;
                return (
                  <div
                    key={field.id}
                    className="md:[grid-column:var(--field-span)]"
                    style={
                      {
                        "--field-span": `span ${Math.min(
                          field.column_span,
                          section.columns,
                        )}`,
                      } as React.CSSProperties
                    }
                  >
                    <FieldInput
                      field={field}
                      value={values[key]}
                      hasPrevious={hasPrevious}
                      locked={locked}
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
  previousByMatrix,
  allowResubmit,
  filter,
  search,
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
  previousByMatrix: PreviousMatrixValuesMap;
  allowResubmit: boolean;
  filter: FieldFilter;
  search: string;
  panEnabled: boolean;
  scrollSync: ReturnType<typeof useHorizontalScrollSync>;
  scrolled: boolean;
  links: EnvLinks;
  onLink: (target: string, source: string | null) => void;
}) {
  const needle = search.trim().toLowerCase();
  const rows = fields.filter((f) => {
    if (isDisplayOnly(f.type)) return false;
    if (!needle) return true;
    const label = fieldPlainLabel(f.label).toLowerCase();
    const help = plainTextFromHtml(f.help_text).toLowerCase();
    return label.includes(needle) || help.includes(needle);
  });

  function rowMatchesFilter(field: ClFormField): boolean {
    if (filter === "all") return true;
    let anyVisible = false;
    let anyNewlyFilled = false;
    let anyFilled = false;
    let anyUnfilled = false;
    for (const env of environments) {
      const visible = evaluateVisible(field.visible_when, values, env);
      if (!visible) continue;
      anyVisible = true;
      const key = makeFieldKey(field.id, env);
      const locked = Boolean(previousByMatrix[field.id]?.[env]) && !allowResubmit;
      const answered = isFieldAnswered(field, values[key]);
      if (locked || answered) anyFilled = true;
      else anyUnfilled = true;
      if (!locked && answered) anyNewlyFilled = true;
    }
    if (!anyVisible) return false;
    if (filter === "new") return anyNewlyFilled;
    if (filter === "filled") return !anyUnfilled;
    return anyUnfilled;
  }

  return (
    <div className="space-y-6">
      {sections.map((section) => {
        const secRows = rows
          .filter((f) => f.section_id === section.id)
          .filter(rowMatchesFilter);
        if (secRows.length === 0) return null;
        return (
          <div key={section.id} className="space-y-2">
            {section.title ? (
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h2>
            ) : null}
            <p className="text-[11px] text-muted-foreground md:hidden">
              Deslize a tabela para o lado para ver todos os ambientes.
            </p>
            <MatrixPanScroll
              panEnabled={panEnabled}
              register={scrollSync.register}
              onScrollSync={scrollSync.onScroll}
              publish={scrollSync.publish}
              className="-mx-4 px-4 sm:mx-0 sm:px-0"
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
                          const hasPrevious = Boolean(previousByMatrix[field.id]?.[env]);
                          const locked = hasPrevious && !allowResubmit;
                          const mirrored = Boolean(links[env]);
                          return (
                            <td
                              key={env}
                              className={
                                matrixEnvCellClass + (hasPrevious ? " bg-muted/30" : "")
                              }
                            >
                              {visible ? (
                                <fieldset
                                  disabled={mirrored}
                                  className="m-0 min-w-0 border-0 p-0 disabled:opacity-100"
                                >
                                  <FieldInput
                                    field={field}
                                    value={values[key]}
                                    compact
                                    hasPrevious={hasPrevious}
                                    locked={locked}
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

function FilterBar({
  filter,
  counts,
  onChange,
  search,
  onSearchChange,
}: {
  filter: FieldFilter;
  counts: { all: number; new: number; filled: number; unfilled: number };
  onChange: (next: FieldFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const options: Array<{ key: FieldFilter; label: string }> = [
    { key: "all", label: "Todos" },
    { key: "unfilled", label: "Não preenchidos" },
    { key: "new", label: "Em preenchimento" },
    { key: "filled", label: "Preenchidos" },
  ];

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:mx-0 sm:rounded-md sm:border sm:px-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Filtrar:</span>
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => {
            const active = filter === opt.key;
            return (
              <Button
                key={opt.key}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => onChange(opt.key)}
                className="h-8"
              >
                <span>{opt.label}</span>
                <span
                  className={
                    "ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold " +
                    (active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground")
                  }
                >
                  {counts[opt.key]}
                </span>
              </Button>
            );
          })}
        </div>
        <div className="relative ml-auto w-full sm:w-48">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar..."
            className="h-8 w-full rounded-md border bg-background pl-8 pr-8 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {search ? (
            <button
              type="button"
              onClick={() => {
                onSearchChange("");
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InfoFieldView({ field }: { field: ClFormField }) {
  const opts = (field.options as Exclude<FieldOptions, null>) ?? {};
  const content = opts.content ?? field.help_text ?? "";
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  const isAllBullets = lines.length > 0 && lines.every((l) => l.trim().startsWith("- "));

  return (
    <div className="rounded-md border border-dashed bg-muted/20 p-3">
      {fieldPlainLabel(field.label) ? (
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide">
          <RichTextOr html={field.label} />
        </div>
      ) : null}
      {isAllBullets ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {lines.map((l, i) => (
            <li key={i}>{l.replace(/^-\s*/, "")}</li>
          ))}
        </ul>
      ) : (
        <p className="whitespace-pre-wrap text-xs italic text-muted-foreground">
          {content}
        </p>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  compact,
  hasPrevious = false,
  locked = false,
  radioGroupName,
  onChange,
}: {
  field: ClFormField;
  value: FieldValue | undefined;
  compact?: boolean;
  hasPrevious?: boolean;
  locked?: boolean;
  radioGroupName?: string;
  onChange: (patch: Partial<FieldValue>) => void;
}) {
  const opts = (field.options as Exclude<FieldOptions, null>) ?? {};
  const choices = opts.choices ?? [];

  if (field.type === "info") {
    return <InfoFieldView field={field} />;
  }

  if (field.type === "image") {
    return (
      <ImageDisplayField
        label={field.label}
        imageUrl={opts.image_url ?? null}
        caption={opts.image_caption ?? null}
        link={opts.image_link ?? null}
      />
    );
  }

  const showLabel = !compact && field.type !== "checkbox";
  const groupValue =
    field.type === "checkbox_group" ? parseCheckboxGroup(value?.value ?? null) : null;

  function updateGroup(next: CheckboxGroupValue) {
    if (locked) return;
    onChange({ value: serializeCheckboxGroup(next) });
  }

  const previousBadge = hasPrevious ? (
    <Badge
      variant="outline"
      className={
        locked
          ? "border-muted-foreground/30 text-muted-foreground"
          : "border-warning text-warning-foreground"
      }
    >
      {locked ? <Lock className="mr-1 h-3 w-3" /> : <History className="mr-1 h-3 w-3" />}
      {locked ? "Já respondido" : "Preenchido anteriormente"}
    </Badge>
  ) : null;

  const containerClassName = "space-y-1.5" + (locked ? " opacity-90" : "");
  const fieldPhoto = opts.image_url ?? null;
  const fieldPhotoButton = fieldPhoto ? (
    <PhotoHintButton
      imagePath={fieldPhoto}
      caption={opts.image_caption ?? null}
      alt={fieldPlainLabel(field.label, "Foto de apoio")}
      size="sm"
    />
  ) : null;

  const isInlineType =
    field.type === "text" ||
    field.type === "number" ||
    field.type === "date" ||
    field.type === "select";

  if (showLabel && isInlineType) {
    const inputEl =
      field.type === "text" ? (
        <Input
          className="min-w-0 flex-1"
          value={value?.value ?? ""}
          disabled={locked}
          readOnly={locked}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : field.type === "number" ? (
        <Input
          type="number"
          className="min-w-0 flex-1"
          value={value?.value ?? ""}
          disabled={locked}
          readOnly={locked}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : field.type === "date" ? (
        <Input
          type="date"
          className="min-w-0 flex-1"
          value={value?.value ?? ""}
          disabled={locked}
          readOnly={locked}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : (
        <div className="min-w-0 flex-1">
          <Select
            value={value?.value ?? ""}
            disabled={locked}
            onValueChange={(v) => onChange({ value: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {choices.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    const selectPhotoEl =
      field.type === "select"
        ? (() => {
            const selected = choices.find((c) => c.value === value?.value);
            if (selected?.image_url) {
              return (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <PhotoHintButton
                    imagePath={selected.image_url}
                    caption={selected.image_caption ?? null}
                    alt={selected.label}
                    size="sm"
                  />
                  <span>Foto da opção selecionada</span>
                </div>
              );
            }
            const withPhotos = choices.filter((c) => c.image_url);
            if (withPhotos.length === 0) return null;
            return (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Ver fotos:</span>
                {withPhotos.map((c) => (
                  <span key={c.value} className="inline-flex items-center gap-1">
                    <PhotoHintButton
                      imagePath={c.image_url}
                      caption={c.image_caption ?? null}
                      alt={c.label}
                      size="xs"
                    />
                    <span>{c.label}</span>
                  </span>
                ))}
              </div>
            );
          })()
        : null;

    return (
      <div className={containerClassName}>
        <div className="flex items-start gap-3">
          <div className="w-36 shrink-0 text-sm font-medium leading-snug">
            <div className="flex min-w-0 items-start gap-1">
              <RichTextOr html={field.label} />
              {field.required ? (
                <span className="text-destructive-foreground">*</span>
              ) : null}
            </div>
          </div>
          {fieldPhotoButton}
          <div className="min-w-0 flex-1 space-y-1.5">
            {inputEl}
            {previousBadge ? <div className="flex">{previousBadge}</div> : null}
          </div>
        </div>
        {selectPhotoEl}
        <FieldHelpText html={field.help_text} />
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      {showLabel ? (
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex min-w-0 items-start gap-1 text-sm font-medium leading-snug">
            <RichTextOr html={field.label} />
            {field.required ? (
              <span className="text-destructive-foreground">*</span>
            ) : null}
          </div>
          {fieldPhotoButton}
          {previousBadge}
        </div>
      ) : previousBadge && field.type !== "checkbox" ? (
        <div className="flex">{previousBadge}</div>
      ) : null}
      {showLabel ? <FieldHelpText html={field.help_text} /> : null}

      {field.type === "text" ? (
        <Input
          value={value?.value ?? ""}
          disabled={locked}
          readOnly={locked}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : null}

      {field.type === "number" ? (
        <Input
          type="number"
          value={value?.value ?? ""}
          disabled={locked}
          readOnly={locked}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : null}

      {field.type === "textarea" ? (
        <Textarea
          rows={compact ? 2 : 3}
          value={value?.value ?? ""}
          disabled={locked}
          readOnly={locked}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : null}

      {field.type === "date" ? (
        <Input
          type="date"
          value={value?.value ?? ""}
          disabled={locked}
          readOnly={locked}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : null}

      {field.type === "checkbox" ? (
        <div className="space-y-1 pt-1">
          <div
            className={
              "flex flex-wrap items-start gap-2 " + (locked ? "cursor-not-allowed" : "")
            }
          >
            <Checkbox
              checked={value?.value === "true"}
              disabled={locked}
              onCheckedChange={(checked) =>
                onChange({ value: checked ? "true" : "false" })
              }
            />
            <div className="min-w-0 text-sm">
              {compact ? (
                "Sim"
              ) : (
                <div
                  className="flex min-w-0 items-start gap-1"
                  onClick={(event) => {
                    if (locked) return;
                    if ((event.target as HTMLElement).closest("a")) return;
                    onChange({ value: value?.value === "true" ? "false" : "true" });
                  }}
                >
                  <RichTextOr html={field.label} />
                  {field.required ? (
                    <span className="text-destructive-foreground">*</span>
                  ) : null}
                </div>
              )}
            </div>
            {!compact ? fieldPhotoButton : null}
            {previousBadge}
          </div>
          {!compact ? <FieldHelpText html={field.help_text} className="pl-6" /> : null}
        </div>
      ) : null}

      {field.type === "checkbox_group" && groupValue ? (
        <div className="space-y-2 pt-1">
          {choices.map((c) => {
            const checked = groupValue.selected.includes(c.value);
            return (
              <div
                key={c.value}
                className={
                  "flex min-w-0 gap-2 text-sm " + (locked ? "cursor-not-allowed" : "")
                }
              >
                <Checkbox
                  className="mt-0.5 shrink-0"
                  checked={checked}
                  disabled={locked}
                  onCheckedChange={(v) => {
                    const nextSelected = v
                      ? [...groupValue.selected, c.value]
                      : groupValue.selected.filter((s) => s !== c.value);
                    updateGroup({ ...groupValue, selected: nextSelected });
                  }}
                />
                <span className="min-w-0 flex-1 break-words">
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span>{c.label}</span>
                    {c.image_url ? (
                      <PhotoHintButton
                        imagePath={c.image_url}
                        caption={c.image_caption ?? null}
                        alt={c.label}
                        size="xs"
                      />
                    ) : null}
                  </span>
                  {c.description ? (
                    <span className="mt-0.5 block text-xs italic text-muted-foreground">
                      {c.description}
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
          {opts.allow_other ? (
            <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
              <Checkbox
                checked={groupValue.other !== undefined}
                disabled={locked}
                onCheckedChange={(v) =>
                  updateGroup({
                    ...groupValue,
                    other: v ? (groupValue.other ?? "") : undefined,
                  })
                }
              />
              <span>Outra:</span>
              <Input
                className="h-8 flex-1"
                value={groupValue.other ?? ""}
                disabled={locked || groupValue.other === undefined}
                readOnly={locked}
                onChange={(e) => updateGroup({ ...groupValue, other: e.target.value })}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {field.type === "select" ? (
        <div className="space-y-1.5">
          <Select
            value={value?.value ?? ""}
            disabled={locked}
            onValueChange={(v) => onChange({ value: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {choices.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(() => {
            const selected = choices.find((c) => c.value === value?.value);
            if (selected?.image_url) {
              return (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <PhotoHintButton
                    imagePath={selected.image_url}
                    caption={selected.image_caption ?? null}
                    alt={selected.label}
                    size="sm"
                  />
                  <span>Foto da opção selecionada</span>
                </div>
              );
            }
            const withPhotos = choices.filter((c) => c.image_url);
            if (withPhotos.length === 0) return null;
            return (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Ver fotos:</span>
                {withPhotos.map((c) => (
                  <span key={c.value} className="inline-flex items-center gap-1">
                    <PhotoHintButton
                      imagePath={c.image_url}
                      caption={c.image_caption ?? null}
                      alt={c.label}
                      size="xs"
                    />
                    <span>{c.label}</span>
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      ) : null}

      {field.type === "radio"
        ? (() => {
            const radioOther = parseRadioOther(value?.value ?? null);
            const isOtherSelected = radioOther !== null;
            return (
              <div className="space-y-1.5 pt-1">
                {choices.map((c) => (
                  <div
                    key={c.value}
                    className={
                      "flex min-w-0 items-start gap-2 text-sm " +
                      (locked ? "cursor-not-allowed" : "")
                    }
                  >
                    <input
                      type="radio"
                      name={radioGroupName ?? field.id}
                      checked={value?.value === c.value}
                      disabled={locked}
                      onChange={() => onChange({ value: c.value })}
                      className="mt-0.5 shrink-0 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="min-w-0 break-words">{c.label}</span>
                        {c.image_url ? (
                          <PhotoHintButton
                            imagePath={c.image_url}
                            caption={c.image_caption ?? null}
                            alt={c.label}
                            size="xs"
                          />
                        ) : null}
                      </div>
                      {c.description ? (
                        <p className="mt-0.5 text-xs italic text-muted-foreground">
                          {c.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
                {opts.allow_other ? (
                  <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
                    <div
                      className={
                        "flex shrink-0 items-center gap-2 " +
                        (locked ? "cursor-not-allowed" : "")
                      }
                    >
                      <input
                        type="radio"
                        name={radioGroupName ?? field.id}
                        checked={isOtherSelected}
                        disabled={locked}
                        onChange={() =>
                          onChange({
                            value: serializeRadioOther(radioOther?.other ?? ""),
                          })
                        }
                        className="cursor-pointer"
                      />
                      <span>Outra:</span>
                    </div>
                    <Input
                      className="h-8 flex-1"
                      value={radioOther?.other ?? ""}
                      disabled={locked || !isOtherSelected}
                      readOnly={locked}
                      onChange={(e) =>
                        onChange({ value: serializeRadioOther(e.target.value) })
                      }
                    />
                  </div>
                ) : null}
              </div>
            );
          })()
        : null}
    </div>
  );
}
