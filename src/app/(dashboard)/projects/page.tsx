import Image from "next/image";
import Link from "next/link";
import { FolderKanban, ImageIcon, Plus } from "lucide-react";

import { BUCKETS } from "@/lib/constants";
import { getPublicBucketBaseUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

import type {
  ClDiscipline,
  ClFormSubmission,
  ClFormTemplate,
  ClPublicLink,
} from "@/lib/supabase/types";

import { ProjectCardMenu } from "./project-card-menu";
import { ProjectPreviewButton } from "./project-preview-button";
import { ProjectPublicSubmissionsDialog } from "./project-public-submissions-dialog";

export const dynamic = "force-dynamic";

const storageBaseUrl = getPublicBucketBaseUrl(BUCKETS.CHECKLIST_IMAGES);

export default async function ProjectsPage() {
  const supabase = createClient();
  const { data: projects } = await supabase
    .from("cl_projects")
    .select("*")
    .order("created_at", { ascending: false });

  const projectIds = (projects ?? []).map((p) => p.id);

  const [
    { data: publicSubmissions },
    { data: templates },
    { data: disciplines },
    { data: publicLinks },
  ] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("cl_form_submissions")
          .select("*")
          .in("project_id", projectIds)
          .not("public_link_id", "is", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as ClFormSubmission[] }),
    projectIds.length > 0
      ? supabase.from("cl_form_templates").select("*").in("project_id", projectIds)
      : Promise.resolve({ data: [] as ClFormTemplate[] }),
    supabase.from("cl_disciplines").select("*").order("position"),
    projectIds.length > 0
      ? supabase
          .from("cl_public_links")
          .select("project_id, token, is_active, created_at")
          .in("project_id", projectIds)
          .is("template_id", null)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Pick<ClPublicLink, "project_id" | "token">[] }),
  ]);

  const publicTokenByProject = new Map<string, string>();
  for (const link of publicLinks ?? []) {
    if (!publicTokenByProject.has(link.project_id)) {
      publicTokenByProject.set(link.project_id, link.token);
    }
  }

  const submissionsByProject = new Map<string, ClFormSubmission[]>();
  for (const s of (publicSubmissions ?? []) as ClFormSubmission[]) {
    const list = submissionsByProject.get(s.project_id) ?? [];
    list.push(s);
    submissionsByProject.set(s.project_id, list);
  }

  const templatesByProject = new Map<string, ClFormTemplate[]>();
  for (const t of (templates ?? []) as ClFormTemplate[]) {
    if (!t.project_id) continue;
    const list = templatesByProject.get(t.project_id) ?? [];
    list.push(t);
    templatesByProject.set(t.project_id, list);
  }

  return (
    <div>
      <PageHeader
        title="Projetos"
        description="Organize checklists e formulários por projeto."
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="mr-2 h-4 w-4" />
              Novo projeto
            </Link>
          </Button>
        }
      />

      {!projects || projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-6 w-6" />}
          title="Nenhum projeto ainda"
          description="Crie seu primeiro projeto para começar a organizar checklists e formulários."
          action={
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="mr-2 h-4 w-4" />
                Criar primeiro projeto
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => {
            const projectSubmissions = submissionsByProject.get(project.id) ?? [];
            const projectTemplates = templatesByProject.get(project.id) ?? [];
            const visibleTemplates = projectTemplates.slice(0, 3);
            const hiddenTemplatesCount =
              projectTemplates.length - visibleTemplates.length;
            return (
              <Card
                key={project.id}
                className="group flex h-full flex-col overflow-hidden transition-colors hover:border-primary/40"
              >
                <div className="relative flex flex-1 flex-col">
                  <Link href={`/projects/${project.id}`} className="flex flex-1 flex-col">
                    <div className="relative h-28 w-full shrink-0 overflow-hidden bg-gradient-to-br from-primary/10 to-muted">
                      {project.image_url ? (
                        <Image
                          src={`${storageBaseUrl}/${project.image_url}`}
                          alt={project.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 px-4 py-3">
                      <p className="line-clamp-1 font-semibold leading-tight">
                        {project.name}
                      </p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {project.description || "Sem descrição"}
                      </p>
                      <div className="mt-auto pt-3">
                        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                          Formulários utilizados
                        </p>
                        {visibleTemplates.length > 0 ? (
                          <ul className="flex flex-wrap gap-x-2 gap-y-1">
                            {visibleTemplates.map((template) => (
                              <li
                                key={template.id}
                                className="max-w-full truncate text-xs text-muted-foreground"
                              >
                                {template.name}
                              </li>
                            ))}
                            {hiddenTemplatesCount > 0 ? (
                              <li className="shrink-0 text-xs text-muted-foreground/70">
                                +{hiddenTemplatesCount} formulário
                                {hiddenTemplatesCount > 1 ? "s" : ""}
                              </li>
                            ) : null}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground/70">
                            Nenhum formulário utilizado
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
                    <ProjectPreviewButton
                      projectId={project.id}
                      projectName={project.name}
                      projectDescription={project.description}
                      projectImageUrl={project.image_url}
                      storageBaseUrl={storageBaseUrl}
                      templates={projectTemplates}
                      disciplines={(disciplines ?? []) as ClDiscipline[]}
                    />
                    <ProjectCardMenu
                      projectId={project.id}
                      projectName={project.name}
                      projectDescription={project.description}
                      publicToken={publicTokenByProject.get(project.id) ?? null}
                    />
                  </div>
                </div>
                <div className="border-t px-6 py-3">
                  <ProjectPublicSubmissionsDialog
                    projectName={project.name}
                    projectId={project.id}
                    submissions={projectSubmissions}
                    templates={projectTemplates}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
