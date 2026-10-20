"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { BUCKETS } from "@/lib/constants";
import { projectCreateSchema, projectRenameSchema } from "@/lib/schemas/projects";
import { assertUser, fail, ok } from "@/lib/server-action";
import { getPublicBucketBaseUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import type {
  ClDesigner,
  ClFormField,
  ClFormSection,
  ClFormSubmission,
  ClFormTemplate,
  ClProjectDesigner,
  ClSubmissionValue,
  ClSubmissionValueMatrix,
} from "@/lib/supabase/types";

export async function createProject(formData: FormData) {
  const parsed = projectCreateSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? null,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { data, error } = await supabase
    .from("cl_projects")
    .insert({
      name: parsed.data.name,
      description: parsed.data.description || null,
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) return fail(error.message);

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function deleteProject(projectId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("cl_projects").delete().eq("id", projectId);

  if (error) return fail(error.message);

  revalidatePath("/projects");
  return ok();
}

export async function renameProject(
  projectId: string,
  name: string,
  description?: string | null,
) {
  const parsed = projectRenameSchema.safeParse({ id: projectId, name, description });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("cl_projects")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
    })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/projects");
  revalidatePath(`/projects/${parsed.data.id}`);
  return ok();
}

export async function duplicateProject(projectId: string) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { data: project, error: fetchError } = await supabase
    .from("cl_projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (fetchError || !project) return fail("Projeto não encontrado.");

  const { error } = await supabase.from("cl_projects").insert({
    name: `Cópia de ${project.name}`,
    description: project.description ?? null,
    created_by: auth.user.id,
  });

  if (error) return fail(error.message);

  revalidatePath("/projects");
  return ok();
}

export interface ProjectSubmissionEntry {
  id: string;
  client_name: string | null;
  client_email: string | null;
  submitted_at: string | null;
  created_at: string;
  values: Pick<ClSubmissionValue, "field_id" | "value" | "image_url">[];
  matrixValues: Pick<ClSubmissionValueMatrix, "field_id" | "env_key" | "value">[];
}

export interface ProjectTemplateReport {
  id: string;
  name: string;
  discipline_name: string | null;
  layout_mode: string | null;
  environments: string[] | null;
  sections: Pick<ClFormSection, "id" | "title" | "position">[];
  fields: Pick<
    ClFormField,
    "id" | "section_id" | "label" | "type" | "options" | "position"
  >[];
  submissions: ProjectSubmissionEntry[];
}

export async function getProjectSubmissionsReport(
  projectId: string,
): Promise<{ data: ProjectTemplateReport[] } | { error: string }> {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return { error: auth.error ?? "Não autenticado." };

  const { data: templates, error: tplErr } = await supabase
    .from("cl_form_templates")
    .select("id, name, layout_mode, environments, discipline_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (tplErr) return { error: tplErr.message };
  if (!templates?.length) return { data: [] };

  const disciplineIds = [
    ...new Set((templates ?? []).map((t) => t.discipline_id).filter(Boolean)),
  ] as string[];

  const { data: disciplines } = disciplineIds.length
    ? await supabase.from("cl_disciplines").select("id, name").in("id", disciplineIds)
    : { data: [] as { id: string; name: string }[] };

  const disciplineNameById = new Map((disciplines ?? []).map((d) => [d.id, d.name]));

  const templateIds = templates.map((t) => t.id);

  const { data: submissions, error: subErr } = await supabase
    .from("cl_form_submissions")
    .select("id, template_id, client_name, client_email, submitted_at, created_at")
    .eq("project_id", projectId)
    .not("public_link_id", "is", null)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });

  if (subErr) return { error: subErr.message };

  const submissionIds = (submissions ?? []).map((s) => s.id);

  const [
    { data: sections, error: secErr },
    { data: fields, error: fldErr },
    { data: values, error: valErr },
    { data: matrixValues, error: matErr },
  ] = await Promise.all([
    supabase
      .from("cl_form_sections")
      .select("id, template_id, title, position")
      .in("template_id", templateIds)
      .order("position"),
    supabase
      .from("cl_form_fields")
      .select("id, template_id, section_id, label, type, options, position")
      .in("template_id", templateIds)
      .order("position"),
    submissionIds.length
      ? supabase
          .from("cl_submission_values")
          .select("submission_id, field_id, value, image_url")
          .in("submission_id", submissionIds)
      : Promise.resolve({
          data: [] as {
            submission_id: string;
            field_id: string;
            value: string | null;
            image_url: string | null;
          }[],
          error: null,
        }),
    submissionIds.length
      ? supabase
          .from("cl_submission_values_matrix")
          .select("submission_id, field_id, env_key, value")
          .in("submission_id", submissionIds)
      : Promise.resolve({
          data: [] as {
            submission_id: string;
            field_id: string;
            env_key: string;
            value: string | null;
          }[],
          error: null,
        }),
  ]);

  if (secErr) return { error: secErr.message };
  if (fldErr) return { error: fldErr.message };
  if (valErr) return { error: valErr.message };
  if (matErr) return { error: matErr.message };

  const valuesBySubmission = new Map<string, typeof values>();
  for (const v of values ?? []) {
    const arr = valuesBySubmission.get(v.submission_id) ?? [];
    arr.push(v);
    valuesBySubmission.set(v.submission_id, arr);
  }

  const matrixBySubmission = new Map<string, typeof matrixValues>();
  for (const m of matrixValues ?? []) {
    const arr = matrixBySubmission.get(m.submission_id) ?? [];
    arr.push(m);
    matrixBySubmission.set(m.submission_id, arr);
  }

  return {
    data: templates.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      discipline_name: tpl.discipline_id
        ? (disciplineNameById.get(tpl.discipline_id) ?? null)
        : null,
      layout_mode: tpl.layout_mode,
      environments: tpl.environments as string[] | null,
      sections: (sections ?? [])
        .filter((s) => s.template_id === tpl.id)
        .map((s) => ({ id: s.id, title: s.title, position: s.position })),
      fields: (fields ?? [])
        .filter((f) => f.template_id === tpl.id)
        .map((f) => ({
          id: f.id,
          section_id: f.section_id,
          label: f.label,
          type: f.type,
          options: f.options,
          position: f.position,
        })),
      submissions: (submissions ?? [])
        .filter((s) => s.template_id === tpl.id)
        .map((s) => ({
          id: s.id,
          client_name: s.client_name,
          client_email: s.client_email,
          submitted_at: s.submitted_at,
          created_at: s.created_at,
          values: (valuesBySubmission.get(s.id) ?? []).map((v) => ({
            field_id: v.field_id,
            value: v.value,
            image_url: v.image_url,
          })),
          matrixValues: (matrixBySubmission.get(s.id) ?? []).map((m) => ({
            field_id: m.field_id,
            env_key: m.env_key,
            value: m.value,
          })),
        })),
    })),
  };
}

export interface SubmissionDetail {
  submission: Pick<
    ClFormSubmission,
    | "id"
    | "client_name"
    | "client_email"
    | "status"
    | "submitted_at"
    | "created_at"
    | "public_link_id"
  >;
  template: Pick<ClFormTemplate, "id" | "name" | "layout_mode" | "environments">;
  sections: Pick<ClFormSection, "id" | "title" | "position">[];
  fields: Pick<
    ClFormField,
    "id" | "section_id" | "label" | "type" | "options" | "position"
  >[];
  values: Pick<ClSubmissionValue, "field_id" | "value" | "image_url">[];
  matrixValues: Pick<
    ClSubmissionValueMatrix,
    "field_id" | "env_key" | "value" | "image_url"
  >[];
}

export interface ProjectSettingsData {
  imageUrl: string | null;
  allowResubmit: boolean;
  allDesigners: ClDesigner[];
  selectedDesignerIds: string[];
  publicBaseUrl: string;
}

export async function getProjectSettingsData(
  projectId: string,
): Promise<{ data: ProjectSettingsData } | { error: string }> {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return { error: auth.error ?? "Não autenticado." };

  const [{ data: project }, { data: allDesigners }, { data: projectDesigners }] =
    await Promise.all([
      supabase
        .from("cl_projects")
        .select("image_url, allow_resubmit_answers")
        .eq("id", projectId)
        .maybeSingle(),
      supabase.from("cl_designers").select("*").order("name"),
      supabase
        .from("cl_project_designers")
        .select("*")
        .eq("project_id", projectId)
        .order("position"),
    ]);

  if (!project) return { error: "Projeto não encontrado." };

  return {
    data: {
      imageUrl: (project as { image_url: string | null }).image_url ?? null,
      allowResubmit: Boolean(
        (project as { allow_resubmit_answers: boolean | null }).allow_resubmit_answers,
      ),
      allDesigners: (allDesigners ?? []) as ClDesigner[],
      selectedDesignerIds: ((projectDesigners ?? []) as ClProjectDesigner[])
        .sort((a, b) => a.position - b.position)
        .map((d) => d.designer_id),
      publicBaseUrl: getPublicBucketBaseUrl(BUCKETS.CHECKLIST_IMAGES),
    },
  };
}

export async function getSubmissionDetail(
  submissionId: string,
): Promise<{ data: SubmissionDetail } | { error: string }> {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return { error: auth.error ?? "Não autenticado." };

  const { data: submission, error: subErr } = await supabase
    .from("cl_form_submissions")
    .select(
      "id, client_name, client_email, status, submitted_at, created_at, public_link_id, template_id",
    )
    .eq("id", submissionId)
    .maybeSingle();

  if (subErr || !submission)
    return { error: subErr?.message ?? "Submissão não encontrada." };

  const [
    { data: template, error: tplErr },
    { data: sections, error: secErr },
    { data: fields, error: fldErr },
    { data: values, error: valErr },
    { data: matrixValues, error: matErr },
  ] = await Promise.all([
    supabase
      .from("cl_form_templates")
      .select("id, name, layout_mode, environments")
      .eq("id", submission.template_id)
      .maybeSingle(),
    supabase
      .from("cl_form_sections")
      .select("id, title, position")
      .eq("template_id", submission.template_id)
      .order("position"),
    supabase
      .from("cl_form_fields")
      .select("id, section_id, label, type, options, position")
      .eq("template_id", submission.template_id)
      .order("position"),
    supabase
      .from("cl_submission_values")
      .select("field_id, value, image_url")
      .eq("submission_id", submissionId),
    supabase
      .from("cl_submission_values_matrix")
      .select("field_id, env_key, value, image_url")
      .eq("submission_id", submissionId),
  ]);

  if (tplErr || !template)
    return { error: tplErr?.message ?? "Template não encontrado." };
  if (secErr) return { error: secErr.message };
  if (fldErr) return { error: fldErr.message };
  if (valErr) return { error: valErr.message };
  if (matErr) return { error: matErr.message };

  return {
    data: {
      submission: {
        id: submission.id,
        client_name: submission.client_name,
        client_email: submission.client_email,
        status: submission.status,
        submitted_at: submission.submitted_at,
        created_at: submission.created_at,
        public_link_id: submission.public_link_id,
      },
      template: {
        id: template.id,
        name: template.name,
        layout_mode: template.layout_mode,
        environments: template.environments as string[] | null,
      },
      sections: (sections ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        position: s.position,
      })),
      fields: (fields ?? []).map((f) => ({
        id: f.id,
        section_id: f.section_id,
        label: f.label,
        type: f.type,
        options: f.options,
        position: f.position,
      })),
      values: (values ?? []).map((v) => ({
        field_id: v.field_id,
        value: v.value,
        image_url: v.image_url,
      })),
      matrixValues: (matrixValues ?? []).map((m) => ({
        field_id: m.field_id,
        env_key: m.env_key,
        value: m.value,
        image_url: m.image_url,
      })),
    },
  };
}
