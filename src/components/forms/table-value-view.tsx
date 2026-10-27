import { resolveFieldTable } from "@/lib/forms/table";
import type { ClFormField } from "@/lib/supabase/types";

export function TableValueView({
  field,
  raw,
}: {
  field: Pick<ClFormField, "options">;
  raw: string | null | undefined;
}) {
  const resolved = resolveFieldTable(field, raw);
  if (resolved.columns.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-muted/40">
            {resolved.columns.map((column) => (
              <th
                key={column.id}
                className="min-w-28 border-b px-2 py-1.5 text-left font-medium"
              >
                {column.label || "Coluna"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {resolved.rows.map((row) => (
            <tr key={row.id}>
              {row.cells.map((cell) => (
                <td key={cell.columnId} className="border-t px-2 py-1.5 align-top">
                  {cell.text.trim() ? (
                    <span className="whitespace-pre-wrap">{cell.text}</span>
                  ) : (
                    <span className="text-muted-foreground"> </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
