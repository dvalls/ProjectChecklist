"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { loadFullReport } from "@/lib/reports/full-report";
import { assertUser, fail, ok } from "@/lib/server-action";
import { createClient } from "@/lib/supabase/server";

export async function updateProjectCover(projectId: string, imageUrl: string | null) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { error } = await supabase
    .from("cl_projects")
    .update({ image_url: imageUrl })
    .eq("id", projectId);

  if (error) return fail(error.message);

  revalidatePath(`/projects/${projectId}`);
  return ok();
}

export async function updateProjectAllowResubmit(projectId: string, allow: boolean) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { error } = await supabase
    .from("cl_projects")
    .update({ allow_resubmit_answers: allow })
    .eq("id", projectId);

  if (error) return fail(error.message);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/settings`);
  return ok();
}

export async function setProjectDesigners(projectId: string, designerIds: string[]) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { data: project } = await supabase
    .from("cl_projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return fail("Projeto não encontrado.");

  const { error: delErr } = await supabase
    .from("cl_project_designers")
    .delete()
    .eq("project_id", projectId);
  if (delErr) return fail(delErr.message);

  if (designerIds.length > 0) {
    const rows = designerIds.map((designer_id, i) => ({
      project_id: projectId,
      designer_id,
      position: i,
    }));
    const { error: insErr } = await supabase.from("cl_project_designers").insert(rows);
    if (insErr) return fail(insErr.message);
  }

  revalidatePath(`/projects/${projectId}`);
  return ok();
}

export async function setTemplatePublic(templateId: string, isPublic: boolean) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { data, error } = await supabase
    .from("cl_form_templates")
    .update({ is_public: isPublic })
    .eq("id", templateId)
    .select("project_id")
    .single();

  if (error || !data) {
    return fail(error?.message ?? "Erro ao atualizar.");
  }
  const typed = data as { project_id: string | null };
  if (typed.project_id) {
    revalidatePath(`/projects/${typed.project_id}`);
  }
  return ok();
}

export async function createProjectPublicLink(projectId: string) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { data: project } = await supabase
    .from("cl_projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return fail("Projeto não encontrado.");

  const token = randomBytes(16).toString("hex");

  const { data, error } = await supabase
    .from("cl_public_links")
    .insert({
      token,
      project_id: projectId,
      template_id: null,
      created_by: auth.user.id,
      is_active: true,
    })
    .select("id, token")
    .single();

  if (error || !data) {
    return fail(error?.message ?? "Erro ao criar link.");
  }

  revalidatePath(`/projects/${projectId}`);
  return ok(data as { id: string; token: string });
}

export async function setProjectLinkActive(linkId: string, isActive: boolean) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { data, error } = await supabase
    .from("cl_public_links")
    .update({ is_active: isActive })
    .eq("id", linkId)
    .select("project_id")
    .single();

  if (error || !data) {
    return fail(error?.message ?? "Erro ao atualizar.");
  }
  const typed = data as { project_id: string };
  revalidatePath(`/projects/${typed.project_id}`);
  return ok();
}

export async function reorderProjectTemplates(projectId: string, orderedIds: string[]) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { data: project } = await supabase
    .from("cl_projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return fail("Projeto não encontrado.");

  const updates = orderedIds.map((id, i) =>
    supabase.from("cl_form_templates").update({ position: i }).eq("id", id),
  );
  const results = await Promise.all(updates);
  for (const { error } of results) {
    if (error) return fail(error.message);
  }

  revalidatePath(`/projects/${projectId}`);
  return ok();
}

export async function syncProjectTemplateGroups(
  projectId: string,
  groups: { disciplineId: string | null; templateIds: string[] }[],
) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { data: project } = await supabase
    .from("cl_projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return fail("Projeto não encontrado.");

  const { data: existing, error } = await supabase
    .from("cl_form_templates")
    .select("id")
    .eq("project_id", projectId);
  if (error) return fail(error.message);

  const allowed = new Set((existing ?? []).map((template) => template.id as string));
  const seen = new Set<string>();
  const updates: { id: string; discipline_id: string | null; position: number }[] = [];

  for (const group of groups) {
    for (const [index, id] of group.templateIds.entries()) {
      if (!allowed.has(id) || seen.has(id)) return fail("Lista de formulários inválida.");
      seen.add(id);
      updates.push({ id, discipline_id: group.disciplineId, position: index });
    }
  }

  if (seen.size !== allowed.size) return fail("Lista de formulários incompleta.");

  const disciplineIds = [
    ...new Set(
      groups.map((group) => group.disciplineId).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (disciplineIds.length > 0) {
    const { data: disciplines, error: disciplineError } = await supabase
      .from("cl_disciplines")
      .select("id")
      .in("id", disciplineIds);
    if (disciplineError) return fail(disciplineError.message);
    if ((disciplines ?? []).length !== disciplineIds.length) {
      return fail("Disciplina não encontrada.");
    }
  }

  const results = await Promise.all(
    updates.map((update) =>
      supabase
        .from("cl_form_templates")
        .update({ discipline_id: update.discipline_id, position: update.position })
        .eq("id", update.id)
        .eq("project_id", projectId),
    ),
  );
  for (const { error: updateError } of results) {
    if (updateError) return fail(updateError.message);
  }

  revalidatePath(`/projects/${projectId}`);
  return ok();
}

export async function reorderDisciplines(orderedIds: string[]) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { data: all, error } = await supabase.from("cl_disciplines").select("id");
  if (error || !all) return fail(error?.message ?? "Erro ao buscar disciplinas.");

  const existing = new Set(all.map((discipline) => discipline.id as string));
  if (
    orderedIds.length !== existing.size ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !existing.has(id))
  ) {
    return fail("Lista de disciplinas inválida.");
  }

  const results = await Promise.all(
    orderedIds.map((id, position) =>
      supabase.from("cl_disciplines").update({ position }).eq("id", id),
    ),
  );
  for (const { error: updateError } of results) {
    if (updateError) return fail(updateError.message);
  }

  return ok();
}

export async function swapDisciplinePositions(id1: string, id2: string) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  // Busca TODAS as disciplinas para normalizar posições e evitar colisões
  const { data: all, error } = await supabase
    .from("cl_disciplines")
    .select("id, position")
    .order("position");

  if (error || !all) return fail(error?.message ?? "Erro ao buscar disciplinas.");

  const typed = all as { id: string; position: number }[];

  // Garante posições sequenciais únicas antes do swap
  const normalized = typed.map((d, i) => ({ ...d, position: i }));
  const idx1 = normalized.findIndex((d) => d.id === id1);
  const idx2 = normalized.findIndex((d) => d.id === id2);
  if (idx1 === -1 || idx2 === -1) return fail("Disciplinas não encontradas.");

  // Troca as posições
  [normalized[idx1].position, normalized[idx2].position] = [
    normalized[idx2].position,
    normalized[idx1].position,
  ];

  const updates = normalized.map((d) =>
    supabase.from("cl_disciplines").update({ position: d.position }).eq("id", d.id),
  );
  const results = await Promise.all(updates);
  for (const { error: e } of results) {
    if (e) return fail(e.message);
  }

  return ok();
}

export async function deleteProjectLink(linkId: string) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  const { data: existing } = await supabase
    .from("cl_public_links")
    .select("project_id")
    .eq("id", linkId)
    .maybeSingle();
  const typedExisting = existing as { project_id: string } | null;

  const { error } = await supabase.from("cl_public_links").delete().eq("id", linkId);

  if (error) return fail(error.message);

  if (typedExisting) {
    revalidatePath(`/projects/${typedExisting.project_id}`);
  }
  return ok();
}

export async function getProjectFullReport(projectId: string) {
  const supabase = createClient();
  const auth = await assertUser(supabase);
  if (!auth.user) return fail(auth.error);

  return loadFullReport(supabase, projectId);
}
