import { FileText, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateCard } from "@/components/templates/template-card";
import type { ClDiscipline } from "@/lib/supabase/types";

import { DisciplineFilter } from "./discipline-filter";
import { NewFreeTemplateDialog } from "./new-template-dialog";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: { disciplina?: string };
}) {
  const activeDisciplineId = searchParams.disciplina ?? null;

  const supabase = createClient();
  const [{ data: allTemplates }, { data: disciplines }] = await Promise.all([
    supabase
      .from("cl_form_templates")
      .select("*, cl_disciplines(name, color)")
      .eq("is_template", true)
      .order("created_at", { ascending: false }),
    supabase.from("cl_disciplines").select("*").order("position"),
  ]);

  const templates = activeDisciplineId
    ? (allTemplates ?? []).filter((t) => t.discipline_id === activeDisciplineId)
    : (allTemplates ?? []);

  return (
    <div>
      <PageHeader
        title="Formulários"
        description="Biblioteca de templates reutilizáveis em qualquer projeto."
        actions={
          <NewFreeTemplateDialog
            disciplines={(disciplines ?? []) as ClDiscipline[]}
            trigger={
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Novo template
              </Button>
            }
          />
        }
      />

      <DisciplineFilter
        disciplines={(disciplines ?? []) as ClDiscipline[]}
        activeId={activeDisciplineId}
      />

      {templates.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<FileText className="h-6 w-6" />}
          title={
            activeDisciplineId ? "Nenhum template nesta disciplina" : "Nenhum template"
          }
          description={
            activeDisciplineId
              ? 'Tente selecionar outra disciplina ou clique em "Todos".'
              : 'Clique em "Novo template" para criar um formulário reutilizável, ou dentro de um projeto use "Salvar como template".'
          }
        />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const discipline = (
              t as unknown as {
                cl_disciplines: { name: string; color: string } | null;
              }
            ).cl_disciplines;
            return (
              <TemplateCard
                key={t.id}
                id={t.id}
                name={t.name}
                description={t.description}
                projectId={null}
                discipline={discipline ?? null}
                layoutMode={t.layout_mode}
                environments={t.environments}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
