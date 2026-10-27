"use server";

import { revalidatePath } from "next/cache";

import { assertUser } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  ClFormField,
  ClFormSection,
  ClFormSubmission,
  ClFormTemplate,
  ClSubmissionValue,
  ClSubmissionValueMatrix,
} from "@/lib/supabase/types";

import type { SubmissionMatrixValueInput, SubmissionValueInput } from "@/lib/forms/types";
import { loadFullReport } from "@/lib/reports/full-report";
import { identityIdentificationSchema } from "@/lib/schemas/public-link";

export type {
  FullReportResult,
  PublicFullReport,
  ReportDesigner,
  ReportOfficeSettings,
  ReportTemplateEntry,
} from "@/lib/reports/full-report";

export type PublicSubmissionValueInput = SubmissionValueInput;
export type PublicSubmissionMatrixValueInput = SubmissionMatrixValueInput;

export interface CreatePublicSubmissionInput {
  token: string;
  template_id?: string;
  client_name: string;
  client_email: string;
  values: PublicSubmissionValueInput[];
  matrix_values?: PublicSubmissionMatrixValueInput[];
}

export async function createPublicSubmission(input: CreatePublicSubmissionInput) {
  const parsed = identityIdentificationSchema.safeParse({
    client_name: input.client_name,
    client_email: input.client_email,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { client_name: name, client_email: email } = parsed.data;

  const supabase = createServiceRoleClient();

  const { data: link, error: linkErr } = await supabase
    .from("cl_public_links")
    .select("id, template_id, project_id, is_active")
    .eq("token", input.token)
    .maybeSingle();

  if (linkErr) return { error: linkErr.message };
  if (!link) return { error: "Link inválido." };

  const typedLink = link as {
    id: string;
    template_id: string | null;
    project_id: string;
    is_active: boolean;
  };

  if (!typedLink.is_active) return { error: "Link desativado." };

  const templateId = input.template_id ?? typedLink.template_id;
  if (!templateId) {
    return { error: "Formulário não especificado." };
  }

  if (typedLink.template_id && typedLink.template_id !== templateId) {
    return { error: "Formulário não pertence a este link." };
  }

  if (!typedLink.template_id) {
    const { data: tpl } = await supabase
      .from("cl_form_templates")
      .select("id, project_id, is_public")
      .eq("id", templateId)
      .maybeSingle();
    const typedTpl = tpl as { id: string; project_id: string; is_public: boolean } | null;
    if (!typedTpl) return { error: "Formulário inválido." };
    if (typedTpl.project_id !== typedLink.project_id) {
      return { error: "Formulário não pertence a este projeto." };
    }
    if (!typedTpl.is_public) {
      return { error: "Este formulário não está disponível no link público." };
    }
  }

  const { data: submission, error: subErr } = await supabase
    .from("cl_form_submissions")
    .insert({
      template_id: templateId,
      project_id: typedLink.project_id,
      submitted_by: null,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      public_link_id: typedLink.id,
      client_name: name,
      client_email: email,
    })
    .select("id")
    .single();

  if (subErr || !submission) {
    return { error: subErr?.message ?? "Erro ao criar submissão." };
  }

  const typedSubmission = submission as { id: string };

  if (input.values.length > 0) {
    const rows = input.values.map((v) => ({
      submission_id: typedSubmission.id,
      field_id: v.field_id,
      value: v.value,
      image_url: v.image_url,
    }));

    const { error: valErr } = await supabase.from("cl_submission_values").insert(rows);

    if (valErr) return { error: valErr.message };
  }

  if (input.matrix_values && input.matrix_values.length > 0) {
    const rows = input.matrix_values.map((v) => ({
      submission_id: typedSubmission.id,
      field_id: v.field_id,
      env_key: v.env_key,
      value: v.value,
      image_url: v.image_url,
    }));

    const { error: matErr } = await supabase
      .from("cl_submission_values_matrix")
      .insert(rows);

    if (matErr) return { error: matErr.message };
  }

  revalidatePath(`/templates/${templateId}`);
  revalidatePath(`/projects/${typedLink.project_id}`);
  revalidatePath(`/p/${input.token}`, "layout");

  return { success: true, submissionId: typedSubmission.id };
}

export interface PublicSubmissionSummary {
  submission: Pick<
    ClFormSubmission,
    "id" | "client_name" | "client_email" | "submitted_at" | "created_at" | "status"
  >;
  template: Pick<
    ClFormTemplate,
    "id" | "name" | "description" | "layout_mode" | "environments"
  >;
  sections: ClFormSection[];
  fields: ClFormField[];
  values: ClSubmissionValue[];
  matrixValues: ClSubmissionValueMatrix[];
}

export async function getPublicSessionSummary(
  token: string,
  submissionIds: string[],
): Promise<
  { data: PublicSubmissionSummary[]; error?: never } | { data?: never; error: string }
> {
  if (submissionIds.length === 0) return { data: [] };

  const supabase = createServiceRoleClient();

  const { data: link } = await supabase
    .from("cl_public_links")
    .select("id, project_id, is_active")
    .eq("token", token)
    .maybeSingle();

  const typedLink = link as { id: string; project_id: string; is_active: boolean } | null;
  if (!typedLink) return { error: "Link inválido." };
  if (!typedLink.is_active) return { error: "Link desativado." };

  const { data: submissions } = await supabase
    .from("cl_form_submissions")
    .select(
      "id, template_id, project_id, client_name, client_email, submitted_at, created_at, status",
    )
    .in("id", submissionIds);

  if (!submissions) return { error: "Submissões não encontradas." };

  const typedSubs = submissions as Pick<
    ClFormSubmission,
    | "id"
    | "template_id"
    | "project_id"
    | "client_name"
    | "client_email"
    | "submitted_at"
    | "created_at"
    | "status"
  >[];

  if (typedSubs.some((s) => s.project_id !== typedLink.project_id)) {
    return { error: "Submissão não pertence a este projeto." };
  }

  const templateIds = [...new Set(typedSubs.map((s) => s.template_id))];

  const [templatesRes, sectionsRes, fieldsRes, valuesRes, matrixRes] = await Promise.all([
    supabase
      .from("cl_form_templates")
      .select("id, name, description, layout_mode, environments")
      .in("id", templateIds),
    supabase
      .from("cl_form_sections")
      .select("*")
      .in("template_id", templateIds)
      .order("position"),
    supabase
      .from("cl_form_fields")
      .select("*")
      .in("template_id", templateIds)
      .order("position"),
    supabase.from("cl_submission_values").select("*").in("submission_id", submissionIds),
    supabase
      .from("cl_submission_values_matrix")
      .select("*")
      .in("submission_id", submissionIds),
  ]);

  const templateById = new Map(
    (
      (templatesRes.data ?? []) as Pick<
        ClFormTemplate,
        "id" | "name" | "description" | "layout_mode" | "environments"
      >[]
    ).map((t) => [t.id, t]),
  );

  const sectionsByTemplate = new Map<string, ClFormSection[]>();
  for (const s of (sectionsRes.data ?? []) as ClFormSection[]) {
    const arr = sectionsByTemplate.get(s.template_id) ?? [];
    arr.push(s);
    sectionsByTemplate.set(s.template_id, arr);
  }

  const fieldsByTemplate = new Map<string, ClFormField[]>();
  for (const f of (fieldsRes.data ?? []) as ClFormField[]) {
    const arr = fieldsByTemplate.get(f.template_id) ?? [];
    arr.push(f);
    fieldsByTemplate.set(f.template_id, arr);
  }

  const valuesBySubmission = new Map<string, ClSubmissionValue[]>();
  for (const v of (valuesRes.data ?? []) as ClSubmissionValue[]) {
    const arr = valuesBySubmission.get(v.submission_id) ?? [];
    arr.push(v);
    valuesBySubmission.set(v.submission_id, arr);
  }

  const matrixBySubmission = new Map<string, ClSubmissionValueMatrix[]>();
  for (const v of (matrixRes.data ?? []) as ClSubmissionValueMatrix[]) {
    const arr = matrixBySubmission.get(v.submission_id) ?? [];
    arr.push(v);
    matrixBySubmission.set(v.submission_id, arr);
  }

  const data: PublicSubmissionSummary[] = typedSubs
    .map((sub) => {
      const template = templateById.get(sub.template_id);
      if (!template) return null;
      return {
        submission: {
          id: sub.id,
          client_name: sub.client_name,
          client_email: sub.client_email,
          submitted_at: sub.submitted_at,
          created_at: sub.created_at,
          status: sub.status,
        },
        template: template as Pick<
          ClFormTemplate,
          "id" | "name" | "description" | "layout_mode" | "environments"
        >,
        sections: sectionsByTemplate.get(sub.template_id) ?? [],
        fields: fieldsByTemplate.get(sub.template_id) ?? [],
        values: valuesBySubmission.get(sub.id) ?? [],
        matrixValues: matrixBySubmission.get(sub.id) ?? [],
      };
    })
    .filter((s): s is PublicSubmissionSummary => s !== null);

  return { data };
}

export async function getPublicSubmissionSummary(
  token: string,
  submissionId: string,
): Promise<
  { data: PublicSubmissionSummary; error?: never } | { data?: never; error: string }
> {
  const supabase = createServiceRoleClient();

  const { data: link } = await supabase
    .from("cl_public_links")
    .select("id, project_id, is_active")
    .eq("token", token)
    .maybeSingle();

  const typedLink = link as { id: string; project_id: string; is_active: boolean } | null;
  if (!typedLink) return { error: "Link inválido." };
  if (!typedLink.is_active) return { error: "Link desativado." };

  const { data: submission } = await supabase
    .from("cl_form_submissions")
    .select(
      "id, template_id, project_id, client_name, client_email, submitted_at, created_at, status",
    )
    .eq("id", submissionId)
    .maybeSingle();

  const typedSubmission = submission as Pick<
    ClFormSubmission,
    | "id"
    | "template_id"
    | "project_id"
    | "client_name"
    | "client_email"
    | "submitted_at"
    | "created_at"
    | "status"
  > | null;

  if (!typedSubmission) return { error: "Submissão não encontrada." };
  if (typedSubmission.project_id !== typedLink.project_id) {
    return { error: "Submissão não pertence a este projeto." };
  }

  const [
    { data: template },
    { data: sections },
    { data: fields },
    { data: values },
    { data: matrixValues },
  ] = await Promise.all([
    supabase
      .from("cl_form_templates")
      .select("id, name, description, layout_mode, environments")
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
    supabase
      .from("cl_submission_values")
      .select("*")
      .eq("submission_id", typedSubmission.id),
    supabase
      .from("cl_submission_values_matrix")
      .select("*")
      .eq("submission_id", typedSubmission.id),
  ]);

  if (!template) return { error: "Formulário não encontrado." };

  return {
    data: {
      submission: {
        id: typedSubmission.id,
        client_name: typedSubmission.client_name,
        client_email: typedSubmission.client_email,
        submitted_at: typedSubmission.submitted_at,
        created_at: typedSubmission.created_at,
        status: typedSubmission.status,
      },
      template: template as Pick<
        ClFormTemplate,
        "id" | "name" | "description" | "layout_mode" | "environments"
      >,
      sections: (sections ?? []) as ClFormSection[],
      fields: (fields ?? []) as ClFormField[],
      values: (values ?? []) as ClSubmissionValue[],
      matrixValues: (matrixValues ?? []) as ClSubmissionValueMatrix[],
    },
  };
}

export async function getPublicFullReport(token: string) {
  const supabase = createServiceRoleClient();

  const { data: link } = await supabase
    .from("cl_public_links")
    .select("id, project_id, is_active")
    .eq("token", token)
    .maybeSingle();

  const typedLink = link as { id: string; project_id: string; is_active: boolean } | null;
  if (!typedLink) return { error: "Link inválido." };
  if (!typedLink.is_active) return { error: "Link desativado." };

  return loadFullReport(supabase, typedLink.project_id);
}

export async function deletePublicSubmission(
  token: string,
  submissionId: string,
): Promise<{ error?: string }> {
  const supabaseAuth = createClient();
  const authResult = await assertUser(supabaseAuth);
  if (!authResult.user) return { error: authResult.error };

  const supabase = createServiceRoleClient();

  const { data: link } = await supabase
    .from("cl_public_links")
    .select("id, project_id, is_active")
    .eq("token", token)
    .maybeSingle();

  const typedLink = link as { id: string; project_id: string; is_active: boolean } | null;
  if (!typedLink) return { error: "Link inválido." };
  if (!typedLink.is_active) return { error: "Link desativado." };

  const { data: project } = await supabase
    .from("cl_projects")
    .select("id, created_by")
    .eq("id", typedLink.project_id)
    .maybeSingle();

  const typedProject = project as { id: string; created_by: string } | null;
  if (!typedProject) return { error: "Projeto não encontrado." };

  if (typedProject.created_by !== authResult.user.id) {
    return { error: "Sem permissão para excluir este preenchimento." };
  }

  const { data: submission } = await supabase
    .from("cl_form_submissions")
    .select("id, project_id")
    .eq("id", submissionId)
    .maybeSingle();

  const typedSubmission = submission as {
    id: string;
    project_id: string;
  } | null;

  if (!typedSubmission) return { error: "Preenchimento não encontrado." };
  if (typedSubmission.project_id !== typedLink.project_id) {
    return { error: "Preenchimento não pertence a este projeto." };
  }

  await Promise.all([
    supabase.from("cl_submission_values").delete().eq("submission_id", submissionId),
    supabase
      .from("cl_submission_values_matrix")
      .delete()
      .eq("submission_id", submissionId),
  ]);

  const { error: deleteError } = await supabase
    .from("cl_form_submissions")
    .delete()
    .eq("id", submissionId);

  if (deleteError) return { error: deleteError.message };

  revalidatePath(`/p/${token}`, "layout");
  revalidatePath(`/projects/${typedLink.project_id}`);

  return {};
}
