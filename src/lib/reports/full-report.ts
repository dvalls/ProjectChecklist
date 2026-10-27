import type { SupabaseClient } from "@supabase/supabase-js";

import { BUCKETS } from "@/lib/constants";
import { getPublicBucketBaseUrl } from "@/lib/storage";
import type {
  ClDiscipline,
  ClFormField,
  ClFormSection,
  ClFormSubmission,
  ClFormTemplate,
  ClOfficeSettings,
  ClProject,
  ClProjectDesigner,
  ClSubmissionValue,
  ClSubmissionValueMatrix,
} from "@/lib/supabase/types";

const BUCKET = BUCKETS.CHECKLIST_IMAGES;

export type ReportOfficeSettings = Pick<
  ClOfficeSettings,
  "office_name" | "logo_url" | "website"
>;

export interface ReportDesigner {
  id: string;
  name: string;
  role: string | null;
  photo_url: string | null;
}

export interface ReportTemplateEntry {
  template: Pick<
    ClFormTemplate,
    "id" | "name" | "description" | "layout_mode" | "environments"
  >;
  sections: ClFormSection[];
  fields: ClFormField[];
  submissions: Array<{
    submission: Pick<
      ClFormSubmission,
      "id" | "client_name" | "client_email" | "submitted_at" | "created_at" | "status"
    >;
    values: ClSubmissionValue[];
    matrixValues: ClSubmissionValueMatrix[];
  }>;
}

export interface PublicFullReport {
  project: Pick<ClProject, "id" | "name" | "description" | "image_url">;
  office: ReportOfficeSettings | null;
  designers: ReportDesigner[];
  disciplines: ClDiscipline[];
  templates: ReportTemplateEntry[];
  publicBaseUrl: string;
  generatedAt: string;
}

export type FullReportResult =
  | { data: PublicFullReport; error?: never }
  | { data?: never; error: string };

type SubmissionRow = Pick<
  ClFormSubmission,
  | "id"
  | "template_id"
  | "client_name"
  | "client_email"
  | "submitted_at"
  | "created_at"
  | "status"
>;

function isFilledValue(value: string | null, imageUrl: string | null) {
  return (value !== null && value !== "") || !!imageUrl;
}

export async function loadFullReport(
  supabase: SupabaseClient,
  projectId: string,
): Promise<FullReportResult> {
  const { data: project } = await supabase
    .from("cl_projects")
    .select("id, name, description, image_url, created_by")
    .eq("id", projectId)
    .maybeSingle();

  const typedProject = project as
    | (Pick<ClProject, "id" | "name" | "description" | "image_url"> & {
        created_by: string;
      })
    | null;
  if (!typedProject) return { error: "Projeto não encontrado." };

  const [
    { data: templates },
    { data: submissions },
    { data: disciplines },
    { data: projectDesigners },
    { data: officeSettingsData },
  ] = await Promise.all([
    supabase
      .from("cl_form_templates")
      .select("id, name, description, layout_mode, environments, discipline_id")
      .eq("project_id", projectId)
      .eq("is_public", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("cl_form_submissions")
      .select(
        "id, template_id, client_name, client_email, submitted_at, created_at, status",
      )
      .eq("project_id", projectId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: true }),
    supabase.from("cl_disciplines").select("*").order("position"),
    supabase
      .from("cl_project_designers")
      .select("*")
      .eq("project_id", projectId)
      .order("position"),
    supabase
      .from("cl_office_settings")
      .select("office_name, logo_url, website")
      .eq("user_id", typedProject.created_by)
      .maybeSingle(),
  ]);

  const typedTemplates = (templates ?? []) as Array<
    Pick<
      ClFormTemplate,
      "id" | "name" | "description" | "layout_mode" | "environments"
    > & { discipline_id: string | null }
  >;

  const typedSubmissions = (submissions ?? []) as SubmissionRow[];

  const templateIds = typedTemplates.map((t) => t.id);
  const submissionIds = typedSubmissions.map((s) => s.id);

  const [{ data: sections }, { data: fields }, { data: values }, { data: matrixValues }] =
    await Promise.all([
      templateIds.length
        ? supabase
            .from("cl_form_sections")
            .select("*")
            .in("template_id", templateIds)
            .order("position")
        : Promise.resolve({ data: [] as ClFormSection[] }),
      templateIds.length
        ? supabase
            .from("cl_form_fields")
            .select("*")
            .in("template_id", templateIds)
            .order("position")
        : Promise.resolve({ data: [] as ClFormField[] }),
      submissionIds.length
        ? supabase
            .from("cl_submission_values")
            .select("*")
            .in("submission_id", submissionIds)
        : Promise.resolve({ data: [] as ClSubmissionValue[] }),
      submissionIds.length
        ? supabase
            .from("cl_submission_values_matrix")
            .select("*")
            .in("submission_id", submissionIds)
        : Promise.resolve({ data: [] as ClSubmissionValueMatrix[] }),
    ]);

  const typedSections = (sections ?? []) as ClFormSection[];
  const typedFields = (fields ?? []) as ClFormField[];
  const typedValues = (values ?? []) as ClSubmissionValue[];
  const typedMatrix = (matrixValues ?? []) as ClSubmissionValueMatrix[];

  const sectionsByTemplate = new Map<string, ClFormSection[]>();
  for (const s of typedSections) {
    const arr = sectionsByTemplate.get(s.template_id) ?? [];
    arr.push(s);
    sectionsByTemplate.set(s.template_id, arr);
  }

  const fieldsByTemplate = new Map<string, ClFormField[]>();
  for (const f of typedFields) {
    const arr = fieldsByTemplate.get(f.template_id) ?? [];
    arr.push(f);
    fieldsByTemplate.set(f.template_id, arr);
  }

  const valuesBySubmission = new Map<string, ClSubmissionValue[]>();
  for (const v of typedValues) {
    const arr = valuesBySubmission.get(v.submission_id) ?? [];
    arr.push(v);
    valuesBySubmission.set(v.submission_id, arr);
  }

  const matrixBySubmission = new Map<string, ClSubmissionValueMatrix[]>();
  for (const v of typedMatrix) {
    const arr = matrixBySubmission.get(v.submission_id) ?? [];
    arr.push(v);
    matrixBySubmission.set(v.submission_id, arr);
  }

  // Consolida as submissões por (template_id, client_email): mescla campo a campo,
  // mantendo sempre a última resposta preenchida (caso o cliente tenha reescrito).
  // typedSubmissions chega em ASC por submitted_at, então a iteração em ordem faz
  // o valor mais recente sobrescrever os anteriores.
  type ConsolidatedSubmission = {
    submission: SubmissionRow;
    values: ClSubmissionValue[];
    matrixValues: ClSubmissionValueMatrix[];
  };

  const groups = new Map<
    string,
    {
      latest: SubmissionRow;
      valuesByField: Map<string, ClSubmissionValue>;
      matrixByKey: Map<string, ClSubmissionValueMatrix>;
    }
  >();

  for (const s of typedSubmissions) {
    const key = `${s.template_id}::${(s.client_email ?? "").toLowerCase()}`;
    let group = groups.get(key);
    if (!group) {
      group = { latest: s, valuesByField: new Map(), matrixByKey: new Map() };
      groups.set(key, group);
    }
    group.latest = s;
    for (const v of valuesBySubmission.get(s.id) ?? []) {
      if (!isFilledValue(v.value, v.image_url)) continue;
      group.valuesByField.set(v.field_id, v);
    }
    for (const v of matrixBySubmission.get(s.id) ?? []) {
      if (!isFilledValue(v.value, v.image_url)) continue;
      group.matrixByKey.set(`${v.field_id}::${v.env_key}`, v);
    }
  }

  const submissionsByTemplate = new Map<string, ConsolidatedSubmission[]>();
  for (const group of groups.values()) {
    const consolidated: ConsolidatedSubmission = {
      submission: group.latest,
      values: Array.from(group.valuesByField.values()),
      matrixValues: Array.from(group.matrixByKey.values()),
    };
    const arr = submissionsByTemplate.get(group.latest.template_id) ?? [];
    arr.push(consolidated);
    submissionsByTemplate.set(group.latest.template_id, arr);
  }

  const disciplinesInUse = new Set(
    typedTemplates.map((t) => t.discipline_id).filter(Boolean) as string[],
  );
  const relevantDisciplines = ((disciplines ?? []) as ClDiscipline[]).filter((d) =>
    disciplinesInUse.has(d.id),
  );

  const typedProjectDesigners = (projectDesigners ?? []) as ClProjectDesigner[];
  let designers: ReportDesigner[] = [];
  if (typedProjectDesigners.length > 0) {
    const designerIds = typedProjectDesigners.map((d) => d.designer_id);
    const { data: designersData } = await supabase
      .from("cl_designers")
      .select("id, name, role, photo_url")
      .in("id", designerIds);
    const byId = new Map(
      ((designersData ?? []) as ReportDesigner[]).map((d) => [d.id, d]),
    );
    designers = typedProjectDesigners
      .map((pd) => byId.get(pd.designer_id))
      .filter((d): d is ReportDesigner => Boolean(d));
  }

  const templatesReport: ReportTemplateEntry[] = typedTemplates.map((t) => {
    const subs = (submissionsByTemplate.get(t.id) ?? []).filter(
      ({ values, matrixValues }) => values.length > 0 || matrixValues.length > 0,
    );
    return {
      template: {
        id: t.id,
        name: t.name,
        description: t.description,
        layout_mode: t.layout_mode,
        environments: t.environments,
      },
      sections: sectionsByTemplate.get(t.id) ?? [],
      fields: fieldsByTemplate.get(t.id) ?? [],
      submissions: subs,
    };
  });

  return {
    data: {
      project: {
        id: typedProject.id,
        name: typedProject.name,
        description: typedProject.description,
        image_url: typedProject.image_url,
      },
      office: (officeSettingsData ?? null) as ReportOfficeSettings | null,
      designers,
      disciplines: relevantDisciplines,
      templates: templatesReport,
      publicBaseUrl: getPublicBucketBaseUrl(BUCKET),
      generatedAt: new Date().toISOString(),
    },
  };
}
