import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BUCKETS, OFFICE_PUBLIC_FIELDS } from "@/lib/constants";
import { getActivePublicLink } from "@/lib/public-link";
import { getPublicAssetUrl, getPublicBucketBaseUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type {
  ClDesigner,
  ClDiscipline,
  ClFormSubmission,
  ClFormTemplate,
  ClOfficeSettings,
  ClProjectDesigner,
} from "@/lib/supabase/types";

import { InactiveLinkCard } from "./inactive-link-card";
import { isPreviewMode } from "./preview-mode";
import { PublicCover } from "./public-cover";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { token: string };
}): Promise<Metadata> {
  const lookup = await getActivePublicLink(params.token);
  if (lookup.status !== "ok") return { title: "Checklist público" };

  const { project } = lookup;
  const supabase = createServiceRoleClient();
  const { data: officeData } = await supabase
    .from("cl_office_settings")
    .select(OFFICE_PUBLIC_FIELDS)
    .eq("user_id", project.created_by)
    .maybeSingle();

  const office = officeData as Pick<ClOfficeSettings, "office_name" | "logo_url"> | null;
  const siteName = office?.office_name ?? "Checklist";
  const title = project.name;
  const description =
    project.description ?? `Checklist do projeto ${title} — ${siteName}`;

  const imageUrl = project.image_url
    ? getPublicAssetUrl(BUCKETS.CHECKLIST_IMAGES, project.image_url)
    : office?.logo_url
      ? getPublicAssetUrl(BUCKETS.CHECKLIST_IMAGES, office.logo_url)
      : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName,
      images: imageUrl ? [{ url: imageUrl, width: 1200, height: 630 }] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : [],
    },
  };
}

export default async function PublicChecklistCoverPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { preview?: string };
}) {
  const lookup = await getActivePublicLink(params.token);
  if (lookup.status === "not-found") notFound();
  if (lookup.status === "inactive") return <InactiveLinkCard />;

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
    { data: projectDesigners },
    { data: submissions },
    { data: officeSettingsData },
  ] = await Promise.all([
    supabase.from("cl_disciplines").select("*").order("position"),
    supabase
      .from("cl_form_templates")
      .select("id, discipline_id, is_public, name")
      .eq("project_id", typedLink.project_id)
      .eq("is_public", true),
    supabase
      .from("cl_project_designers")
      .select("*")
      .eq("project_id", typedLink.project_id)
      .order("position"),
    supabase
      .from("cl_form_submissions")
      .select(
        "id, template_id, client_name, client_email, submitted_at, created_at, status",
      )
      .eq("project_id", typedLink.project_id)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false }),
    supabase
      .from("cl_office_settings")
      .select(OFFICE_PUBLIC_FIELDS)
      .eq("user_id", project.created_by)
      .maybeSingle(),
  ]);

  const typedProjectDesigners = (projectDesigners ?? []) as ClProjectDesigner[];
  const designerIds = typedProjectDesigners.map((d) => d.designer_id);

  let designers: ClDesigner[] = [];
  if (designerIds.length > 0) {
    const { data: designersData } = await supabase
      .from("cl_designers")
      .select("*")
      .in("id", designerIds);
    const byId = new Map(((designersData ?? []) as ClDesigner[]).map((d) => [d.id, d]));
    designers = typedProjectDesigners
      .map((pd) => byId.get(pd.designer_id))
      .filter((d): d is ClDesigner => Boolean(d));
  }

  const publicTemplates = (templates ?? []) as Pick<
    ClFormTemplate,
    "id" | "discipline_id" | "is_public" | "name"
  >[];

  const disciplinesInUse = new Set(
    publicTemplates.map((t) => t.discipline_id).filter(Boolean),
  );
  const relevantDisciplines = ((disciplines ?? []) as ClDiscipline[]).filter((d) =>
    disciplinesInUse.has(d.id),
  );

  const publicBaseUrl = getPublicBucketBaseUrl(BUCKETS.CHECKLIST_IMAGES);

  const typedSubmissions = (submissions ?? []) as Pick<
    ClFormSubmission,
    | "id"
    | "template_id"
    | "client_name"
    | "client_email"
    | "submitted_at"
    | "created_at"
    | "status"
  >[];

  const templatesById = new Map(publicTemplates.map((t) => [t.id, t.name] as const));
  const history = typedSubmissions.map((s) => ({
    id: s.id,
    template_id: s.template_id,
    template_name: templatesById.get(s.template_id) ?? "Formulário",
    client_name: s.client_name,
    client_email: s.client_email,
    submitted_at: s.submitted_at ?? s.created_at,
  }));

  const officeSettings = officeSettingsData as Pick<
    ClOfficeSettings,
    | "office_name"
    | "logo_url"
    | "website"
    | "instagram"
    | "facebook"
    | "linkedin"
    | "twitter"
    | "whatsapp"
  > | null;

  return (
    <PublicCover
      token={typedLink.token}
      project={project}
      designers={designers}
      disciplines={relevantDisciplines}
      formCount={publicTemplates.length}
      publicBaseUrl={publicBaseUrl}
      history={history}
      officeSettings={officeSettings}
      isProjectOwner={isProjectOwner}
      preview={isPreviewMode(searchParams.preview)}
    />
  );
}
