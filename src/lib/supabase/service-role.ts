import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

export function createServiceRoleClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      // Next.js 14 guarda o fetch no cache da rota. Sem isso, a leitura das
      // respostas anteriores devolve um resultado antigo ou vazio.
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
