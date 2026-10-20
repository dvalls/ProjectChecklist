import { z } from "zod";

export const projectCreateSchema = z.object({
  name: z.string().trim().min(1, "Nome do projeto é obrigatório."),
  description: z.string().trim().nullable().optional(),
  image_url: z.string().trim().nullable().optional(),
  client_name: z.string().trim().nullable().optional(),
  start_date: z.string().trim().nullable().optional(),
  end_date: z.string().trim().nullable().optional(),
});

export const projectRenameSchema = z.object({
  id: z.string().uuid("ID de projeto inválido."),
  name: z.string().trim().min(1, "Nome do projeto é obrigatório."),
  description: z.string().trim().nullable().optional(),
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectRenameInput = z.infer<typeof projectRenameSchema>;
