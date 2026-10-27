import { formatDateTime as baseFormatDateTime } from "@/lib/format";
import { formatTablePlain } from "@/lib/forms/table";
import type { ClFormField, FieldOptions } from "@/lib/supabase/types";

export function formatFieldValue(field: ClFormField, raw: string | null): string {
  if (field.type === "table") return formatTablePlain(field, raw);
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

export function formatDateTime(iso: string | null): string {
  return baseFormatDateTime(iso) || "—";
}

export type WorksheetBlank =
  | { kind: "line" }
  | { kind: "block" }
  | { kind: "text"; text: string };

export interface WorksheetChoice {
  label: string;
  selected: boolean;
}

function fieldOptions(field: ClFormField) {
  return (field.options as Exclude<FieldOptions, null>) ?? {};
}

/** Opções do campo, com a resposta já dada marcada. `null` se não for escolha. */
export function worksheetChoices(
  field: ClFormField,
  raw: string | null,
): WorksheetChoice[] | null {
  const opts = fieldOptions(field);
  const choices = opts.choices ?? [];
  const empty = raw === null || raw === undefined || raw === "";

  if (field.type === "checkbox") {
    return [
      { label: "Sim", selected: raw === "true" },
      { label: "Não", selected: !empty && raw !== "true" },
    ];
  }

  if (field.type === "radio" || field.type === "select") {
    let selectedValue: string | null = empty ? null : raw;
    let otherText: string | null = null;
    if (!empty && raw) {
      try {
        const parsed = JSON.parse(raw) as { other?: unknown };
        if (parsed && typeof parsed.other === "string") {
          selectedValue = "__other__";
          otherText = parsed.other;
        }
      } catch {
        // valor simples
      }
    }
    const items: WorksheetChoice[] = choices.map((choice) => ({
      label: choice.label.trim() || choice.value,
      selected: selectedValue === choice.value,
    }));
    if (opts.allow_other || selectedValue === "__other__") {
      items.push({
        label: otherText ? `Outra: ${otherText}` : "Outra",
        selected: selectedValue === "__other__",
      });
    }
    return items.filter((item) => item.label);
  }

  if (field.type === "checkbox_group") {
    const selected = new Set<string>();
    let otherText: string | null = null;
    if (!empty && raw) {
      try {
        const parsed = JSON.parse(raw) as { selected?: unknown; other?: unknown };
        if (Array.isArray(parsed.selected)) {
          for (const value of parsed.selected) {
            if (typeof value === "string") selected.add(value);
          }
        }
        if (typeof parsed.other === "string" && parsed.other) otherText = parsed.other;
      } catch {
        selected.add(raw);
      }
    }
    const items: WorksheetChoice[] = choices.map((choice) => ({
      label: choice.label.trim() || choice.value,
      selected: selected.has(choice.value),
    }));
    if (opts.allow_other || otherText) {
      items.push({
        label: otherText ? `Outra: ${otherText}` : "Outra",
        selected: Boolean(otherText),
      });
    }
    return items.filter((item) => item.label);
  }

  return null;
}

function choiceLabels(field: ClFormField): string[] {
  const opts = fieldOptions(field);
  const labels = (opts.choices ?? [])
    .map((choice) => choice.label.trim())
    .filter(Boolean);
  if (opts.allow_other) labels.push("Outra");
  return labels;
}

/** Espaço em branco do checklist imprimível, quando o campo ainda não tem resposta. */
export function worksheetBlank(field: ClFormField): WorksheetBlank {
  if (field.type === "textarea" || field.type === "table") return { kind: "block" };
  if (field.type === "image") return { kind: "text", text: "Anexar foto" };
  if (field.type === "checkbox") return { kind: "text", text: "Sim / Não" };
  if (
    field.type === "radio" ||
    field.type === "select" ||
    field.type === "checkbox_group"
  ) {
    const labels = choiceLabels(field);
    if (labels.length === 0) return { kind: "line" };
    return { kind: "text", text: labels.map((label) => `( ) ${label}`).join("   ") };
  }
  return { kind: "line" };
}

/** Sim/Não (ou opções só Sim/Não) cabem na grade compacta da matriz. */
export function worksheetBlankIsShort(field: ClFormField): boolean {
  if (field.type === "checkbox") return true;
  if (
    field.type !== "radio" &&
    field.type !== "select" &&
    field.type !== "checkbox_group"
  ) {
    return false;
  }
  const labels = choiceLabels(field);
  return labels.length > 0 && labels.every((label) => isShortYesNoLabel(label));
}

function isShortYesNoLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "sim" || normalized === "não" || normalized === "nao";
}
