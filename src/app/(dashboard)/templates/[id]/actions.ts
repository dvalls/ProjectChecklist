"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { sanitizeFieldHtml } from "@/lib/rich-text";
import type {
  ClFormField,
  ClFormSection,
  ClFormTemplate,
  ColumnSpan,
  FieldOptions,
  FieldType,
  LayoutMode,
  SectionColumns,
  VisibleWhen,
} from "@/lib/supabase/types";

export interface FieldInput {
  id?: string;
  section_id: string | null;
  section_local_id: string | null;
  group_key?: string | null;
  label: string;
  help_text?: string | null;
  type: FieldType;
  required: boolean;
  column_span: ColumnSpan;
  position: number;
  options: FieldOptions;
  visible_when: VisibleWhen | null;
  visible_when_local_id: string | null;
}

export interface SectionInput {
  id?: string;
  local_id: string;
  title: string;
  subtitle: string | null;
  columns: SectionColumns;
  position: number;
}

export interface TemplateSavePayload {
  name: string;
  description: string | null;
  layout_mode: LayoutMode;
  environments: string[] | null;
  sections: SectionInput[];
  fields: FieldInput[];
}

export async function saveTemplate(templateId: string, payload: TemplateSavePayload) {
  const supabase = createClient();

  if (!payload.name.trim()) return { error: "Nome é obrigatório." };

  if (payload.layout_mode === "matrix") {
    const envs = (payload.environments ?? []).map((e) => e.trim()).filter(Boolean);
    if (envs.length === 0) {
      return {
        error: "Matriz requer pelo menos um ambiente.",
      };
    }
    payload.environments = envs;
  } else {
    payload.environments = null;
  }

  const { error: metaErr } = await supabase
    .from("cl_form_templates")
    .update({
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      layout_mode: payload.layout_mode,
      environments: payload.environments,
    })
    .eq("id", templateId);

  if (metaErr) return { error: metaErr.message };

  const { data: existingSections, error: secFetchErr } = await supabase
    .from("cl_form_sections")
    .select("id")
    .eq("template_id", templateId);
  if (secFetchErr) return { error: secFetchErr.message };

  const incomingSectionIds = new Set(
    payload.sections.map((s) => s.id).filter((v): v is string => Boolean(v)),
  );
  const sectionsToDelete =
    existingSections?.filter((s) => !incomingSectionIds.has(s.id)).map((s) => s.id) ?? [];

  if (sectionsToDelete.length > 0) {
    const { error } = await supabase
      .from("cl_form_sections")
      .delete()
      .in("id", sectionsToDelete);
    if (error) return { error: error.message };
  }

  const localToRealSection = new Map<string, string>();

  for (const section of payload.sections) {
    if (section.id) {
      localToRealSection.set(section.local_id, section.id);
      const { error } = await supabase
        .from("cl_form_sections")
        .update({
          title: section.title,
          subtitle: section.subtitle,
          columns: section.columns,
          position: section.position,
        })
        .eq("id", section.id);
      if (error) return { error: error.message };
    } else {
      const { data, error } = await supabase
        .from("cl_form_sections")
        .insert({
          template_id: templateId,
          title: section.title,
          subtitle: section.subtitle,
          columns: section.columns,
          position: section.position,
        })
        .select("id")
        .single();
      if (error || !data) {
        return { error: error?.message ?? "Erro ao criar seção." };
      }
      localToRealSection.set(section.local_id, (data as { id: string }).id);
    }
  }

  const { data: existingFields, error: fieldFetchErr } = await supabase
    .from("cl_form_fields")
    .select("id")
    .eq("template_id", templateId);
  if (fieldFetchErr) return { error: fieldFetchErr.message };

  const incomingFieldIds = new Set(
    payload.fields.map((f) => f.id).filter((v): v is string => Boolean(v)),
  );
  const fieldsToDelete =
    existingFields?.filter((f) => !incomingFieldIds.has(f.id)).map((f) => f.id) ?? [];

  if (fieldsToDelete.length > 0) {
    const { error } = await supabase
      .from("cl_form_fields")
      .delete()
      .in("id", fieldsToDelete);
    if (error) return { error: error.message };
  }

  const localToRealField = new Map<string, string>();

  const fieldsWithSections = payload.fields.map((f) => ({
    ...f,
    label: sanitizeFieldHtml(f.label),
    help_text: sanitizeFieldHtml(f.help_text) || null,
    section_id: f.section_local_id
      ? (localToRealSection.get(f.section_local_id) ?? null)
      : null,
  }));

  for (const field of fieldsWithSections) {
    if (field.id) {
      const { error } = await supabase
        .from("cl_form_fields")
        .update({
          section_id: field.section_id,
          group_key: field.group_key ?? null,
          label: field.label,
          help_text: field.help_text ?? null,
          type: field.type,
          required: field.required,
          column_span: field.column_span,
          position: field.position,
          options: field.options,
        })
        .eq("id", field.id);
      if (error) return { error: error.message };
      localToRealField.set(field.visible_when_local_id ?? field.id, field.id);
    } else {
      const { data, error } = await supabase
        .from("cl_form_fields")
        .insert({
          template_id: templateId,
          section_id: field.section_id,
          group_key: field.group_key ?? null,
          label: field.label,
          help_text: field.help_text ?? null,
          type: field.type,
          required: field.required,
          column_span: field.column_span,
          position: field.position,
          options: field.options,
        })
        .select("id")
        .single();
      if (error || !data) {
        return { error: error?.message ?? "Erro ao criar campo." };
      }
      const newId = (data as { id: string }).id;
      if (field.visible_when_local_id) {
        localToRealField.set(field.visible_when_local_id, newId);
      }
    }
  }

  // Second pass for visible_when — we need the full id mapping before updating.
  // Build id lookup combining existing ids and new ids.
  const idLookup = new Map<string, string>();
  for (const f of fieldsWithSections) {
    const key = f.visible_when_local_id ?? f.id;
    if (!key) continue;
    const realId = f.id ?? localToRealField.get(key);
    if (realId) idLookup.set(key, realId);
  }

  for (const field of fieldsWithSections) {
    if (!field.visible_when) {
      if (field.id) {
        const { error } = await supabase
          .from("cl_form_fields")
          .update({ visible_when: null })
          .eq("id", field.id);
        if (error) return { error: error.message };
      }
      continue;
    }

    const triggerLocalOrId = field.visible_when.field_id;
    const resolvedTrigger = idLookup.get(triggerLocalOrId) ?? triggerLocalOrId;

    const realFieldId =
      field.id ??
      (field.visible_when_local_id
        ? localToRealField.get(field.visible_when_local_id)
        : undefined);

    if (!realFieldId) continue;

    const { error } = await supabase
      .from("cl_form_fields")
      .update({
        visible_when: {
          field_id: resolvedTrigger,
          op: field.visible_when.op,
          value: field.visible_when.value,
        },
      })
      .eq("id", realFieldId);
    if (error) return { error: error.message };
  }

  revalidatePath(`/templates/${templateId}`);
  return { success: true };
}

export async function renameTemplate(templateId: string, newName: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("cl_form_templates")
    .update({ name: newName })
    .eq("id", templateId);

  if (error) return { error: error.message };

  revalidatePath(`/templates/${templateId}`);
  revalidatePath(`/templates`);
  return { success: true };
}

export async function deleteTemplate(templateId: string, projectId: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("cl_form_templates")
    .delete()
    .eq("id", templateId);

  if (error) return { error: error.message };

  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
  revalidatePath(`/templates`);
  revalidatePath(`/settings/forms`);
  return { success: true };
}

export async function saveAsTemplate(templateId: string) {
  const supabase = createClient();

  const { data: source, error: srcErr } = await supabase
    .from("cl_form_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (srcErr || !source) {
    return { error: srcErr?.message ?? "Formulário não encontrado." };
  }
  const typedSource = source as ClFormTemplate;

  if (typedSource.is_template) {
    return { error: "Este formulário já é um template." };
  }

  const { data: existing } = await supabase
    .from("cl_form_templates")
    .select("name")
    .eq("is_template", true);
  const existingNames = new Set(
    ((existing ?? []) as { name: string }[]).map((e) => e.name),
  );
  let newName = typedSource.name;
  if (existingNames.has(newName)) {
    let suffix = 2;
    while (existingNames.has(`${typedSource.name} (${suffix})`)) suffix++;
    newName = `${typedSource.name} (${suffix})`;
  }

  const { data: newTpl, error: tplErr } = await supabase
    .from("cl_form_templates")
    .insert({
      project_id: null,
      is_template: true,
      discipline_id: typedSource.discipline_id,
      name: newName,
      description: typedSource.description,
      layout_mode: typedSource.layout_mode,
      environments: typedSource.environments,
      is_public: true,
    })
    .select("id")
    .single();
  if (tplErr || !newTpl) {
    return { error: tplErr?.message ?? "Erro ao salvar como template." };
  }
  const newTemplateId = (newTpl as { id: string }).id;

  const { data: sections, error: secErr } = await supabase
    .from("cl_form_sections")
    .select("*")
    .eq("template_id", templateId)
    .order("position", { ascending: true });
  if (secErr) return { error: secErr.message };

  const sectionIdMap = new Map<string, string>();
  for (const s of (sections ?? []) as ClFormSection[]) {
    const { data: newSec, error: insErr } = await supabase
      .from("cl_form_sections")
      .insert({
        template_id: newTemplateId,
        title: s.title,
        subtitle: s.subtitle,
        columns: s.columns,
        position: s.position,
      })
      .select("id")
      .single();
    if (insErr || !newSec) {
      return { error: insErr?.message ?? "Erro ao copiar seção." };
    }
    sectionIdMap.set(s.id, (newSec as { id: string }).id);
  }

  const { data: fields, error: fieldsErr } = await supabase
    .from("cl_form_fields")
    .select("*")
    .eq("template_id", templateId)
    .order("position", { ascending: true });
  if (fieldsErr) return { error: fieldsErr.message };

  const fieldIdMap = new Map<string, string>();
  for (const f of (fields ?? []) as ClFormField[]) {
    const mappedSectionId = f.section_id
      ? (sectionIdMap.get(f.section_id) ?? null)
      : null;
    const { data: newField, error: fErr } = await supabase
      .from("cl_form_fields")
      .insert({
        template_id: newTemplateId,
        section_id: mappedSectionId,
        group_key: f.group_key,
        label: f.label,
        help_text: f.help_text,
        type: f.type,
        required: f.required,
        column_span: f.column_span,
        position: f.position,
        options: f.options,
      })
      .select("id")
      .single();
    if (fErr || !newField) {
      return { error: fErr?.message ?? "Erro ao copiar campo." };
    }
    fieldIdMap.set(f.id, (newField as { id: string }).id);
  }

  for (const f of (fields ?? []) as ClFormField[]) {
    if (!f.visible_when) continue;
    const newFieldId = fieldIdMap.get(f.id);
    const newTriggerId = fieldIdMap.get(f.visible_when.field_id);
    if (!newFieldId || !newTriggerId) continue;
    const updatedVisible: VisibleWhen = {
      field_id: newTriggerId,
      op: f.visible_when.op,
      value: f.visible_when.value,
    };
    await supabase
      .from("cl_form_fields")
      .update({ visible_when: updatedVisible })
      .eq("id", newFieldId);
  }

  revalidatePath(`/settings/forms`);
  return { success: true, templateId: newTemplateId };
}

export async function fetchTemplatePreview(templateId: string) {
  const supabase = createClient();
  const [{ data: sections, error: secErr }, { data: fields, error: fieldsErr }] =
    await Promise.all([
      supabase
        .from("cl_form_sections")
        .select("*")
        .eq("template_id", templateId)
        .order("position"),
      supabase
        .from("cl_form_fields")
        .select("*")
        .eq("template_id", templateId)
        .order("position"),
    ]);
  if (secErr) return { error: secErr.message };
  if (fieldsErr) return { error: fieldsErr.message };
  return {
    sections: (sections ?? []) as ClFormSection[],
    fields: (fields ?? []) as ClFormField[],
  };
}

export async function duplicateTemplate(templateId: string) {
  const supabase = createClient();

  const { data: source, error: srcErr } = await supabase
    .from("cl_form_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (srcErr || !source) {
    return { error: srcErr?.message ?? "Formulário não encontrado." };
  }
  const typedSource = source as ClFormTemplate;

  const existingQuery = supabase.from("cl_form_templates").select("name");
  const { data: existing } = typedSource.project_id
    ? await existingQuery.eq("project_id", typedSource.project_id)
    : await existingQuery.eq("is_template", true);
  const existingNames = new Set(
    ((existing ?? []) as { name: string }[]).map((e) => e.name),
  );
  let newName = `${typedSource.name} (cópia)`;
  if (existingNames.has(newName)) {
    let suffix = 2;
    while (existingNames.has(`${typedSource.name} (cópia ${suffix})`)) suffix++;
    newName = `${typedSource.name} (cópia ${suffix})`;
  }

  const { data: newTpl, error: tplErr } = await supabase
    .from("cl_form_templates")
    .insert({
      project_id: typedSource.project_id,
      is_template: typedSource.is_template,
      discipline_id: typedSource.discipline_id,
      name: newName,
      description: typedSource.description,
      layout_mode: typedSource.layout_mode,
      environments: typedSource.environments,
      is_public: true,
    })
    .select("id")
    .single();
  if (tplErr || !newTpl) {
    return { error: tplErr?.message ?? "Erro ao duplicar formulário." };
  }
  const newTemplateId = (newTpl as { id: string }).id;

  const { data: sections, error: secErr } = await supabase
    .from("cl_form_sections")
    .select("*")
    .eq("template_id", templateId)
    .order("position", { ascending: true });
  if (secErr) return { error: secErr.message };

  const sectionIdMap = new Map<string, string>();
  for (const s of (sections ?? []) as ClFormSection[]) {
    const { data: newSec, error: insErr } = await supabase
      .from("cl_form_sections")
      .insert({
        template_id: newTemplateId,
        title: s.title,
        subtitle: s.subtitle,
        columns: s.columns,
        position: s.position,
      })
      .select("id")
      .single();
    if (insErr || !newSec) {
      return { error: insErr?.message ?? "Erro ao copiar seção." };
    }
    sectionIdMap.set(s.id, (newSec as { id: string }).id);
  }

  const { data: fields, error: fieldsErr } = await supabase
    .from("cl_form_fields")
    .select("*")
    .eq("template_id", templateId)
    .order("position", { ascending: true });
  if (fieldsErr) return { error: fieldsErr.message };

  const fieldIdMap = new Map<string, string>();
  for (const f of (fields ?? []) as ClFormField[]) {
    const mappedSectionId = f.section_id
      ? (sectionIdMap.get(f.section_id) ?? null)
      : null;
    const { data: newField, error: fErr } = await supabase
      .from("cl_form_fields")
      .insert({
        template_id: newTemplateId,
        section_id: mappedSectionId,
        group_key: f.group_key,
        label: f.label,
        help_text: f.help_text,
        type: f.type,
        required: f.required,
        column_span: f.column_span,
        position: f.position,
        options: f.options,
      })
      .select("id")
      .single();
    if (fErr || !newField) {
      return { error: fErr?.message ?? "Erro ao copiar campo." };
    }
    fieldIdMap.set(f.id, (newField as { id: string }).id);
  }

  for (const f of (fields ?? []) as ClFormField[]) {
    if (!f.visible_when) continue;
    const newFieldId = fieldIdMap.get(f.id);
    const newTriggerId = fieldIdMap.get(f.visible_when.field_id);
    if (!newFieldId || !newTriggerId) continue;
    const updatedVisible: VisibleWhen = {
      field_id: newTriggerId,
      op: f.visible_when.op,
      value: f.visible_when.value,
    };
    await supabase
      .from("cl_form_fields")
      .update({ visible_when: updatedVisible })
      .eq("id", newFieldId);
  }

  if (typedSource.project_id) {
    revalidatePath(`/projects/${typedSource.project_id}`);
  }
  revalidatePath(`/templates`);
  revalidatePath(`/settings/forms`);
  return { success: true, templateId: newTemplateId };
}
