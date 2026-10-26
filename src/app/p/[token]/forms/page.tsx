import { notFound } from "next/navigation";

import { OFFICE_PUBLIC_FIELDS } from "@/lib/constants";
import { getActivePublicLink } from "@/lib/public-link";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  ClDiscipline,
  ClFormField,
  ClFormSubmission,
  ClFormTemplate,
  ClSubmissionValue,
  ClSubmissionValueMatrix,
} from "@/lib/supabase/types";
import type { PublicOfficeSettings } from "../public-footer";

import { InactiveLinkCard } from "../inactive-link-card";
import { isPreviewMode } from "../preview-mode";
import { PublicFormsList } from "./public-forms-list";

export const dynamic = "force-dynamic";

export default async function PublicFormsListPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { preview?: string };
}) {
  const lookup = await getActivePublicLink(params.token);
  if (lookup.status === "not-found") notFound();
  if (lookup.status === "inactive") {
    return <InactiveLinkCard description="Este link foi desativado pelo responsável." />;
  }

  const { link: typedLink, project } = lookup;
  const supabase = createServiceRoleClient();

  const supabaseAuth = createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  const isProjectOwner = Boolean(user && user.id === project.created_by);

  const [
    { data: disciplines },
    { data: templates },
    { data: submissions },
    { data: projectSubmissions },
  ] = await Promise.all([
    supabase.from("cl_disciplines").select("*").order("position"),
    supabase
      .from("cl_form_templates")
      .select("*")
      .eq("project_id", typedLink.project_id)
      .eq("is_public", true)
      .order("position"),
    supabase
      .from("cl_form_submissions")
      .select("id, template_id, client_email, status")
      .eq("public_link_id", typedLink.id),
    supabase
      .from("cl_form_submissions")
      .select("id, template_id")
      .eq("project_id", typedLink.project_id)
      .eq("status", "submitted"),
  ]);

  const { data: officeSettingsData } = await supabase
    .from("cl_office_settings")
    .select(OFFICE_PUBLIC_FIELDS)
    .eq("user_id", project.created_by)
    .maybeSingle();

  const officeSettings = officeSettingsData as PublicOfficeSettings | null;

  const typedTemplates = (templates ?? []) as ClFormTemplate[];
  const templateIds = typedTemplates.map((t) => t.id);

  const { data: allFields } = templateIds.length
    ? await supabase
        .from("cl_form_fields")
        .select("id, template_id, type, required")
        .in("template_id", templateIds)
    : { data: [] as Pick<ClFormField, "id" | "template_id" | "type" | "required">[] };

  const typedAllFields = (allFields ?? []) as Pick<
    ClFormField,
    "id" | "template_id" | "type" | "required"
  >[];

  const fillableFieldsByTemplate = new Map<string, Set<string>>();
  for (const f of typedAllFields) {
    if (f.type === "info" || f.type === "image") continue;
    let set = fillableFieldsByTemplate.get(f.template_id);
    if (!set) {
      set = new Set<string>();
      fillableFieldsByTemplate.set(f.template_id, set);
    }
    set.add(f.id);
  }

  const requiredCountByTemplate: Record<string, number> = {};
  const totalAllByTemplate: Record<string, number> = {};
  for (const t of typedTemplates) {
    const fillableIds = fillableFieldsByTemplate.get(t.id) ?? new Set<string>();
    const requiredBase = typedAllFields.filter(
      (f) =>
        f.template_id === t.id && f.required && f.type !== "info" && f.type !== "image",
    ).length;
    const envCount =
      t.layout_mode === "matrix" ? Math.max(1, (t.environments ?? []).length) : 1;
    requiredCountByTemplate[t.id] = requiredBase * envCount;
    totalAllByTemplate[t.id] = fillableIds.size * envCount;
  }

  const typedProjectSubmissions = (projectSubmissions ?? []) as Pick<
    ClFormSubmission,
    "id" | "template_id"
  >[];

  const hasPreviousByTemplate: Record<string, boolean> = {};
  const answeredAllByTemplate: Record<string, number> = {};

  if (typedProjectSubmissions.length > 0) {
    const submissionIds = typedProjectSubmissions.map((s) => s.id);
    const submissionToTemplate = new Map<string, string>();
    for (const s of typedProjectSubmissions) {
      submissionToTemplate.set(s.id, s.template_id);
    }

    const [{ data: anyValues }, { data: anyMatrix }] = await Promise.all([
      supabase
        .from("cl_submission_values")
        .select("submission_id, field_id, value, image_url")
        .in("submission_id", submissionIds),
      supabase
        .from("cl_submission_values_matrix")
        .select("submission_id, field_id, env_key, value, image_url")
        .in("submission_id", submissionIds),
    ]);

    const withValues = new Set<string>();
    const answeredKeysByTemplate = new Map<string, Set<string>>();

    function recordAnswer(templateId: string, key: string) {
      let set = answeredKeysByTemplate.get(templateId);
      if (!set) {
        set = new Set<string>();
        answeredKeysByTemplate.set(templateId, set);
      }
      set.add(key);
    }

    for (const row of (anyValues ?? []) as Pick<
      ClSubmissionValue,
      "submission_id" | "field_id" | "value" | "image_url"
    >[]) {
      withValues.add(row.submission_id);
      const templateId = submissionToTemplate.get(row.submission_id);
      if (!templateId) continue;
      const fillable = fillableFieldsByTemplate.get(templateId);
      if (!fillable || !fillable.has(row.field_id)) continue;
      const hasValue = (row.value !== null && row.value !== "") || Boolean(row.image_url);
      if (!hasValue) continue;
      recordAnswer(templateId, row.field_id);
    }

    for (const row of (anyMatrix ?? []) as Pick<
      ClSubmissionValueMatrix,
      "submission_id" | "field_id" | "env_key" | "value" | "image_url"
    >[]) {
      withValues.add(row.submission_id);
      const templateId = submissionToTemplate.get(row.submission_id);
      if (!templateId) continue;
      const fillable = fillableFieldsByTemplate.get(templateId);
      if (!fillable || !fillable.has(row.field_id)) continue;
      const hasValue = (row.value !== null && row.value !== "") || Boolean(row.image_url);
      if (!hasValue) continue;
      recordAnswer(templateId, `${row.field_id}::${row.env_key}`);
    }

    for (const s of typedProjectSubmissions) {
      if (withValues.has(s.id)) {
        hasPreviousByTemplate[s.template_id] = true;
      }
    }
    for (const [templateId, set] of answeredKeysByTemplate) {
      answeredAllByTemplate[templateId] = set.size;
    }
  }

  const allowResubmit = Boolean(project.allow_resubmit_answers);

  return (
    <PublicFormsList
      token={typedLink.token}
      project={project}
      disciplines={(disciplines ?? []) as ClDiscipline[]}
      templates={typedTemplates}
      submissions={
        (submissions ?? []) as Pick<
          ClFormSubmission,
          "id" | "template_id" | "client_email" | "status"
        >[]
      }
      requiredCountByTemplate={requiredCountByTemplate}
      totalAllByTemplate={totalAllByTemplate}
      answeredAllByTemplate={answeredAllByTemplate}
      hasPreviousByTemplate={hasPreviousByTemplate}
      allowResubmit={allowResubmit}
      officeSettings={officeSettings}
      isProjectOwner={isProjectOwner}
      preview={isPreviewMode(searchParams.preview)}
    />
  );
}
