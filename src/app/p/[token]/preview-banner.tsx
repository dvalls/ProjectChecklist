import { Eye } from "lucide-react";

export function PreviewBanner() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning bg-warning/30 px-3 py-2 text-sm text-warning-foreground">
      <Eye className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Modo visualização. Dá para percorrer e preencher o formulário, mas as respostas
        não são gravadas.
      </p>
    </div>
  );
}
