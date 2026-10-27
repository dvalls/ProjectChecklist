"use client";

import { ImageDisplayField } from "@/components/form-builder/field-preview";
import { PhotoHintButton } from "@/components/form-builder/photo-hint-button";
import { FieldHelpText, RichTextOr } from "@/components/rich-text";
import { ChoiceLabel, RecommendedBadge } from "@/components/form-builder/shared";
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

import type { ClFormField, FieldOptions } from "@/lib/supabase/types";

import { TableFieldControl } from "@/components/forms/table-field";
import type { CheckboxGroupValue, FieldValue } from "@/lib/forms/types";
import { fieldPlainLabel } from "@/lib/rich-text";
import {
  parseCheckboxGroup,
  parseRadioOther,
  serializeCheckboxGroup,
  serializeRadioOther,
} from "@/lib/forms/utils";

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

export function FieldInputControl({
  field,
  value,
  compact,
  radioGroupName,
  onChange,
}: {
  field: ClFormField;
  value: FieldValue | undefined;
  compact?: boolean;
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

  if (field.type === "table") {
    const showTableLabel = !compact;
    return (
      <div className="space-y-1.5">
        {showTableLabel ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 items-start gap-1 text-sm font-medium leading-snug">
              <RichTextOr html={field.label} />
              {field.required ? (
                <span className="text-destructive-foreground">*</span>
              ) : null}
            </div>
            {opts.image_url ? (
              <PhotoHintButton
                imagePath={opts.image_url}
                caption={opts.image_caption ?? null}
                alt={fieldPlainLabel(field.label, "Foto de apoio")}
                size="sm"
              />
            ) : null}
          </div>
        ) : null}
        {showTableLabel ? <FieldHelpText html={field.help_text} /> : null}
        <TableFieldControl
          field={field}
          value={value?.value ?? null}
          onChange={(next) => onChange({ value: next })}
        />
      </div>
    );
  }

  const showLabel = !compact && field.type !== "checkbox";
  const groupValue =
    field.type === "checkbox_group" ? parseCheckboxGroup(value?.value ?? null) : null;

  function updateGroup(next: CheckboxGroupValue) {
    onChange({ value: serializeCheckboxGroup(next) });
  }

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
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : field.type === "number" ? (
        <Input
          type="number"
          className="min-w-0 flex-1"
          value={value?.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : field.type === "date" ? (
        <Input
          type="date"
          className="min-w-0 flex-1"
          value={value?.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : (
        <div className="min-w-0 flex-1">
          <Select
            value={value?.value ?? ""}
            onValueChange={(v) => onChange({ value: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {choices.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <ChoiceLabel label={c.label} recommended={c.recommended} />
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
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <div className="w-36 shrink-0 text-sm font-medium leading-snug">
            <div className="flex min-w-0 items-start gap-1">
              <RichTextOr html={field.label} />
              {field.required ? (
                <span className="text-destructive-foreground">*</span>
              ) : null}
            </div>
          </div>
          {fieldPhotoButton}
          {inputEl}
        </div>
        {selectPhotoEl}
        <FieldHelpText html={field.help_text} />
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {showLabel ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium leading-snug">
            <div className="flex min-w-0 items-start gap-1">
              <RichTextOr html={field.label} />
              {field.required ? (
                <span className="text-destructive-foreground">*</span>
              ) : null}
            </div>
          </div>
          {fieldPhotoButton}
        </div>
      ) : null}
      {showLabel ? <FieldHelpText html={field.help_text} /> : null}

      {field.type === "text" ? (
        <Input
          value={value?.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : null}

      {field.type === "number" ? (
        <Input
          type="number"
          value={value?.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : null}

      {field.type === "textarea" ? (
        <Textarea
          rows={compact ? 2 : 3}
          value={value?.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : null}

      {field.type === "date" ? (
        <Input
          type="date"
          value={value?.value ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      ) : null}

      {field.type === "checkbox" ? (
        <div className="space-y-1 pt-1">
          <div className="flex cursor-pointer items-start gap-2">
            <Checkbox
              checked={value?.value === "true"}
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
            {opts.recommended_value ? <RecommendedBadge /> : null}
          </div>
          {!compact ? <FieldHelpText html={field.help_text} className="pl-6" /> : null}
          {opts.recommended_value && !compact ? (
            <p className="pl-6 text-[11px] text-warning-foreground">
              StudioBIM recomenda:{" "}
              <strong>{opts.recommended_value === "true" ? "Sim" : "Não"}</strong>
            </p>
          ) : null}
        </div>
      ) : null}

      {field.type === "checkbox_group" && groupValue ? (
        <div className="space-y-1.5 pt-1">
          {choices.map((c) => {
            const checked = groupValue.selected.includes(c.value);
            return (
              <div key={c.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => {
                    const nextSelected = v
                      ? [...groupValue.selected, c.value]
                      : groupValue.selected.filter((s) => s !== c.value);
                    updateGroup({ ...groupValue, selected: nextSelected });
                  }}
                />
                <ChoiceLabel label={c.label} recommended={c.recommended} />
                {c.image_url ? (
                  <PhotoHintButton
                    imagePath={c.image_url}
                    caption={c.image_caption ?? null}
                    alt={c.label}
                    size="xs"
                  />
                ) : null}
              </div>
            );
          })}
          {opts.allow_other ? (
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={groupValue.other !== undefined}
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
                disabled={groupValue.other === undefined}
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
            onValueChange={(v) => onChange({ value: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione..." />
            </SelectTrigger>
            <SelectContent>
              {choices.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <ChoiceLabel label={c.label} recommended={c.recommended} />
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
                  <div key={c.value} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={radioGroupName ?? field.id}
                      checked={value?.value === c.value}
                      onChange={() => onChange({ value: c.value })}
                      className="mt-0.5 shrink-0 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <ChoiceLabel label={c.label} recommended={c.recommended} />
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
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={radioGroupName ?? field.id}
                        checked={isOtherSelected}
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
                      disabled={!isOtherSelected}
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
