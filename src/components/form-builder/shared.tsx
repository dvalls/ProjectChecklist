"use client";

import {
  AlignLeft,
  Calendar,
  CheckSquare,
  Circle,
  FileText,
  Hash,
  Image as ImageIcon,
  Info,
  List,
  ListChecks,
  Star,
  Table2,
  Type,
  type LucideIcon,
} from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { ColumnSpan, FieldType, SectionColumns } from "@/lib/supabase/types";

export const RECOMMENDED_LABEL = "StudioBIM recomenda";

export const TYPE_META: Record<
  FieldType,
  { label: string; icon: LucideIcon; short: string; description: string }
> = {
  text: {
    label: "Texto curto",
    short: "Texto",
    icon: Type,
    description: "Uma linha de texto",
  },
  textarea: {
    label: "Texto longo",
    short: "Longo",
    icon: AlignLeft,
    description: "Várias linhas",
  },
  number: {
    label: "Número",
    short: "Número",
    icon: Hash,
    description: "Valor numérico",
  },
  date: {
    label: "Data",
    short: "Data",
    icon: Calendar,
    description: "Seletor de data",
  },
  checkbox: {
    label: "Sim / Não",
    short: "Sim/Não",
    icon: CheckSquare,
    description: "Marcação única",
  },
  checkbox_group: {
    label: "Múltiplas seleções",
    short: "Múltiplas",
    icon: ListChecks,
    description: "Vários checkboxes",
  },
  select: {
    label: "Seleção",
    short: "Seleção",
    icon: List,
    description: "Dropdown",
  },
  radio: {
    label: "Escolha única",
    short: "Única",
    icon: Circle,
    description: "Botões de rádio",
  },
  image: {
    label: "Imagem",
    short: "Imagem",
    icon: ImageIcon,
    description: "Imagem ilustrativa embutida no formulário",
  },
  info: {
    label: "Bloco informativo",
    short: "Info",
    icon: Info,
    description: "Texto explicativo",
  },
  table: {
    label: "Tabela",
    short: "Tabela",
    icon: Table2,
    description: "Linhas e colunas, com células livres",
  },
};

export const FIELD_TYPE_ORDER: FieldType[] = [
  "text",
  "textarea",
  "number",
  "date",
  "checkbox",
  "checkbox_group",
  "select",
  "radio",
  "image",
  "info",
  "table",
];

export function FieldTypeIcon({
  type,
  className,
}: {
  type: FieldType;
  className?: string;
}) {
  const Icon = TYPE_META[type].icon;
  return <Icon className={cn("h-4 w-4", className)} />;
}

export function TypePicker({
  value,
  onChange,
  triggerClassName,
}: {
  value: FieldType;
  onChange: (v: FieldType) => void;
  triggerClassName?: string;
}) {
  const current = TYPE_META[value];
  const CurrentIcon = current.icon;

  return (
    <Select value={value} onValueChange={(v) => onChange(v as FieldType)}>
      <SelectTrigger className={cn("h-9", triggerClassName)}>
        <span className="!flex min-w-0 items-center gap-2">
          <CurrentIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{current.label}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {FIELD_TYPE_ORDER.map((t) => {
          const meta = TYPE_META[t];
          const Icon = meta.icon;
          return (
            <SelectItem key={t} value={t}>
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex flex-col">
                  <span className="text-sm leading-tight">{meta.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {meta.description}
                  </span>
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function SegmentedBars({
  total,
  filled,
  active,
}: {
  total: number;
  filled: number;
  active: boolean;
}) {
  return (
    <div className="flex items-end gap-0.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-3 w-1.5 rounded-sm",
            i < filled
              ? active
                ? "bg-background"
                : "bg-foreground"
              : active
                ? "bg-background/40"
                : "bg-muted-foreground/30",
          )}
        />
      ))}
    </div>
  );
}

export function ColumnsPicker({
  value,
  onChange,
}: {
  value: SectionColumns;
  onChange: (v: SectionColumns) => void;
}) {
  const options: SectionColumns[] = [1, 2, 3, 4];
  return (
    <div className="inline-flex rounded-md border bg-background p-0.5">
      {options.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted",
            )}
            title={`${n} ${n === 1 ? "coluna" : "colunas"}`}
          >
            <SegmentedBars total={n} filled={n} active={active} />
          </button>
        );
      })}
    </div>
  );
}

export function SpanPicker({
  value,
  max,
  onChange,
}: {
  value: ColumnSpan;
  max: SectionColumns;
  onChange: (v: ColumnSpan) => void;
}) {
  const options: ColumnSpan[] = [1, 2, 3, 4];
  return (
    <div className="inline-flex rounded-md border bg-background p-0.5">
      {options.map((n) => {
        const active = value === n;
        const disabled = n > max;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={cn(
              "flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted",
              disabled && "cursor-not-allowed opacity-30 hover:bg-transparent",
            )}
            title={`ocupa ${n} de ${max}`}
          >
            <SegmentedBars total={max} filled={n} active={active} />
          </button>
        );
      })}
    </div>
  );
}

export function RecommendedStar({
  className,
  filled = true,
}: {
  className?: string;
  filled?: boolean;
}) {
  return (
    <Star
      aria-label={RECOMMENDED_LABEL}
      className={cn(
        "h-3.5 w-3.5",
        filled ? "fill-amber-400 text-amber-500" : "text-muted-foreground",
        className,
      )}
    />
  );
}

export function RecommendedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700",
        className,
      )}
      title={RECOMMENDED_LABEL}
    >
      <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
      {RECOMMENDED_LABEL}
    </span>
  );
}

export function ChoiceLabel({
  label,
  recommended,
  showBadge = true,
}: {
  label: string;
  recommended?: boolean;
  showBadge?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      {recommended ? showBadge ? <RecommendedBadge /> : <RecommendedStar /> : null}
    </span>
  );
}

export { FileText };
