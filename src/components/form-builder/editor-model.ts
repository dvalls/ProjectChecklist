import type {
  ColumnSpan,
  FieldOptions,
  FieldType,
  SectionColumns,
  VisibleWhen,
} from "@/lib/supabase/types";

export interface EditorSection {
  local_id: string;
  id?: string;
  title: string;
  subtitle: string | null;
  columns: SectionColumns;
}

export interface EditorField {
  localId: string;
  id?: string;
  section_local_id: string | null;
  group_key: string | null;
  label: string;
  help_text: string | null;
  type: FieldType;
  required: boolean;
  column_span: ColumnSpan;
  options: FieldOptions;
  visible_when: VisibleWhen | null;
}
