import type { ClFormField, VisibleWhen } from "@/lib/supabase/types";

import { isTableAnswered } from "./table";
import type { CheckboxGroupValue, FieldValue } from "./types";

export function isDisplayOnly(type: ClFormField["type"]) {
  return type === "info" || type === "image";
}

export function makeFieldKey(fieldId: string, env?: string) {
  return env ? `${fieldId}::${env}` : fieldId;
}

export function splitFieldKey(key: string): { fieldId: string; env?: string } {
  const idx = key.indexOf("::");
  if (idx === -1) return { fieldId: key };
  return { fieldId: key.slice(0, idx), env: key.slice(idx + 2) };
}

/** Ambiente de destino → ambiente de origem que ele acompanha. */
export type EnvLinks = Record<string, string>;

export function resolveEnvRoot(env: string, links: EnvLinks): string {
  let current = env;
  const seen = new Set<string>();
  while (links[current] && !seen.has(current)) {
    seen.add(current);
    current = links[current];
  }
  return current;
}

/** Grava que `target` acompanha `source`. `source` nulo remove o vínculo.
 * Se a origem já acompanha o destino, esse ciclo é desfeito. */
export function linkEnvironment(
  links: EnvLinks,
  target: string,
  source: string | null,
): EnvLinks {
  const next: EnvLinks = { ...links };
  if (!source || source === target) {
    delete next[target];
    return next;
  }
  next[target] = source;
  let current = source;
  const seen = new Set<string>();
  while (next[current] && !seen.has(current)) {
    seen.add(current);
    if (next[current] === target) {
      delete next[current];
      break;
    }
    current = next[current];
  }
  return next;
}

export function linksFromDraft(
  links: { target: string; source: string }[] | undefined,
  environments: string[],
): EnvLinks {
  const allowed = new Set(environments);
  const out: EnvLinks = {};
  for (const link of links ?? []) {
    if (!allowed.has(link.target) || !allowed.has(link.source)) continue;
    if (link.target === link.source) continue;
    out[link.target] = link.source;
  }
  return out;
}

/** Copia as respostas da origem do grupo para os ambientes igualados.
 * Com `fieldId`, usa o valor recém-editado nesse ambiente. Sem ele, copia
 * tudo a partir da origem raiz. */
export function syncLinkedField({
  fields,
  values,
  environments,
  links,
  editedEnv,
  fieldId,
  isTargetLocked = () => false,
}: {
  fields: Pick<ClFormField, "id" | "type">[];
  values: Record<string, FieldValue>;
  environments: string[];
  links: EnvLinks;
  editedEnv: string;
  fieldId?: string;
  isTargetLocked?: (fieldId: string, env: string) => boolean;
}): Record<string, FieldValue> {
  const root = resolveEnvRoot(editedEnv, links);
  const group = environments.filter((env) => resolveEnvRoot(env, links) === root);
  if (group.length < 2) return values;
  const next: Record<string, FieldValue> = { ...values };
  const selected = fieldId ? fields.filter((field) => field.id === fieldId) : fields;
  const originEnv = fieldId ? editedEnv : root;
  for (const field of selected) {
    if (isDisplayOnly(field.type)) continue;
    const value = next[makeFieldKey(field.id, originEnv)]?.value ?? null;
    for (const env of group) {
      if (env === originEnv) continue;
      if (isTargetLocked(field.id, env)) continue;
      next[makeFieldKey(field.id, env)] = { value };
    }
  }
  return next;
}

export function parseCheckboxGroup(value: string | null): CheckboxGroupValue {
  if (!value) return { selected: [] };
  try {
    const parsed = JSON.parse(value);
    if (parsed && Array.isArray(parsed.selected)) {
      return {
        selected: parsed.selected,
        other: typeof parsed.other === "string" ? parsed.other : undefined,
      };
    }
  } catch {
    // not JSON, fallthrough
  }
  return { selected: [] };
}

export function serializeCheckboxGroup(v: CheckboxGroupValue): string | null {
  const hasOther = v.other !== undefined;
  if (v.selected.length === 0 && !hasOther) return null;
  return JSON.stringify({
    selected: v.selected,
    ...(hasOther ? { other: v.other ?? "" } : {}),
  });
}

export function parseRadioOther(value: string | null): { other: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed.other === "string") {
      return { other: parsed.other };
    }
  } catch {
    // not JSON, plain value
  }
  return null;
}

export function serializeRadioOther(text: string): string {
  return JSON.stringify({ other: text });
}

export function evaluateVisible(
  condition: VisibleWhen | null,
  values: Record<string, FieldValue>,
  env?: string,
): boolean {
  if (!condition) return true;
  const targetKey = makeFieldKey(condition.field_id, env);
  const fieldVal = values[targetKey];
  if (!fieldVal) return false;
  const raw = fieldVal.value;

  if (condition.op === "truthy") {
    if (raw === null || raw === undefined || raw === "") return false;
    if (raw === "false") return false;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.selected)) {
        return parsed.selected.length > 0 || Boolean(parsed.other);
      }
    } catch {
      // not JSON, fallthrough
    }
    return true;
  }

  if (condition.op === "eq") {
    return raw === condition.value;
  }

  if (condition.op === "includes") {
    if (!condition.value) return false;
    try {
      const parsed = JSON.parse(raw ?? "");
      if (parsed && Array.isArray(parsed.selected)) {
        return parsed.selected.includes(condition.value);
      }
    } catch {
      // not JSON
    }
    return raw === condition.value;
  }

  return true;
}

export interface CopyEnvironmentResult {
  values: Record<string, FieldValue>;
  copiedCells: number;
  skippedLocked: number;
}

/** Copia as respostas de um ambiente da matriz para outros. Campos só de exibição
 * são ignorados. Destinos bloqueados permanecem como estão. */
export function copyEnvironmentValues(
  fields: Pick<ClFormField, "id" | "type">[],
  values: Record<string, FieldValue>,
  source: string,
  targets: string[],
  isTargetLocked: (fieldId: string, env: string) => boolean = () => false,
): CopyEnvironmentResult {
  const next: Record<string, FieldValue> = { ...values };
  let copiedCells = 0;
  let skippedLocked = 0;
  const destinations = targets.filter((env) => env !== source);

  for (const field of fields) {
    if (isDisplayOnly(field.type)) continue;
    const sourceValue = values[makeFieldKey(field.id, source)]?.value ?? null;
    for (const target of destinations) {
      if (isTargetLocked(field.id, target)) {
        skippedLocked += 1;
        continue;
      }
      next[makeFieldKey(field.id, target)] = { value: sourceValue };
      copiedCells += 1;
    }
  }

  return { values: next, copiedCells, skippedLocked };
}

export function isFieldAnswered(field: ClFormField, v: FieldValue | undefined): boolean {
  if (field.type === "checkbox") return v?.value === "true";
  if (field.type === "checkbox_group") {
    const parsed = parseCheckboxGroup(v?.value ?? null);
    return parsed.selected.length > 0 || Boolean(parsed.other);
  }
  if (field.type === "radio") {
    const radioOther = parseRadioOther(v?.value ?? null);
    if (radioOther !== null) return Boolean(radioOther.other);
    return Boolean(v?.value);
  }
  if (field.type === "table") return isTableAnswered(field, v?.value ?? null);
  return Boolean(v?.value && v.value.trim() !== "");
}

/**
 * Valor inicial de um campo no preenchimento público.
 * `draft === undefined` indica que o rascunho não tem o campo.
 * `previous === undefined` indica que não há resposta anterior.
 * Um rascunho vazio não esconde uma resposta já enviada.
 */
export function resolvePrefillValue(
  field: ClFormField,
  draft: string | null | undefined,
  previous: string | null | undefined,
  allowResubmit: boolean,
): string | null {
  const hasPreviousRecord = previous !== undefined;
  const draftAnswered = draft !== undefined && isFieldAnswered(field, { value: draft });
  const draftMayWin = draft !== undefined && (allowResubmit || !hasPreviousRecord);

  if (draftMayWin && draftAnswered) return draft;
  if (previous !== undefined && previous !== null) return previous;
  if (draftMayWin) return draft;
  return field.type === "checkbox" ? "false" : null;
}
