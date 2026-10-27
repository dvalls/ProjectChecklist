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
