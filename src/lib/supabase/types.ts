export type FieldType =
  | "text"
  | "textarea"
  | "checkbox"
  | "checkbox_group"
  | "select"
  | "radio"
  | "date"
  | "number"
  | "image"
  | "info"
  | "table";

export type ColumnSpan = 1 | 2 | 3 | 4;

export type SectionColumns = 1 | 2 | 3 | 4;

export type LayoutMode = "standard" | "matrix";

export type SubmissionStatus = "draft" | "submitted";

export interface Choice {
  label: string;
  value: string;
  recommended?: boolean;
  description?: string;
  image_url?: string | null;
  image_caption?: string | null;
}

export interface TableColumnOption {
  id: string;
  label: string;
}

export interface TableRowOption {
  id: string;
  cells: Record<string, string>;
}

export interface FieldOptionsShape {
  choices?: Choice[];
  allow_other?: boolean;
  content?: string;
  image_url?: string | null;
  image_caption?: string | null;
  image_link?: string | null;
  recommended_value?: "true" | "false" | null;
  columns?: TableColumnOption[];
  rows?: TableRowOption[];
}

export type FieldOptions = FieldOptionsShape | null;

export type ConditionOp = "eq" | "includes" | "truthy";

export interface VisibleWhen {
  field_id: string;
  op: ConditionOp;
  value?: string;
}

export interface ClProject {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  allow_resubmit_answers: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ClDiscipline {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  position: number;
  created_at: string;
}

export interface ClFormTemplate {
  id: string;
  project_id: string | null;
  discipline_id: string | null;
  name: string;
  description: string | null;
  layout_mode: LayoutMode;
  environments: string[] | null;
  is_public: boolean;
  is_template: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ClFormSection {
  id: string;
  template_id: string;
  title: string;
  subtitle: string | null;
  columns: SectionColumns;
  position: number;
  created_at: string;
}

export interface ClFormField {
  id: string;
  template_id: string;
  section_id: string | null;
  group_key: string | null;
  label: string;
  help_text: string | null;
  type: FieldType;
  required: boolean;
  column_span: ColumnSpan;
  position: number;
  options: FieldOptions;
  visible_when: VisibleWhen | null;
  created_at: string;
}

export interface ClFormSubmission {
  id: string;
  project_id: string;
  template_id: string;
  submitted_by: string | null;
  status: SubmissionStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  public_link_id: string | null;
  client_name: string | null;
  client_email: string | null;
}

export interface ClPublicLink {
  id: string;
  token: string;
  template_id: string | null;
  project_id: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
}

export interface ClDesigner {
  id: string;
  name: string;
  role: string | null;
  formation: string | null;
  photo_url: string | null;
  created_by: string;
  created_at: string;
}

export interface ClProjectDesigner {
  project_id: string;
  designer_id: string;
  position: number;
  created_at: string;
}

export interface ClOfficeSettings {
  id: string;
  user_id: string;
  office_name: string | null;
  logo_url: string | null;
  website: string | null;
  instagram: string | null;
  facebook: string | null;
  linkedin: string | null;
  twitter: string | null;
  whatsapp: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClSubmissionValue {
  id: string;
  submission_id: string;
  field_id: string;
  value: string | null;
  image_url: string | null;
  created_at: string;
}

export interface ClSubmissionValueMatrix {
  id: string;
  submission_id: string;
  field_id: string;
  env_key: string;
  value: string | null;
  image_url: string | null;
  created_at: string;
}

type WithDefaults<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required>>;

type Relationships = [];

export type Database = {
  public: {
    Tables: {
      cl_projects: {
        Row: ClProject;
        Insert: WithDefaults<ClProject, "name" | "created_by">;
        Update: Partial<ClProject>;
        Relationships: Relationships;
      };
      cl_disciplines: {
        Row: ClDiscipline;
        Insert: WithDefaults<ClDiscipline, "name">;
        Update: Partial<ClDiscipline>;
        Relationships: Relationships;
      };
      cl_form_templates: {
        Row: ClFormTemplate;
        Insert: WithDefaults<ClFormTemplate, "name">;
        Update: Partial<ClFormTemplate>;
        Relationships: Relationships;
      };
      cl_form_sections: {
        Row: ClFormSection;
        Insert: WithDefaults<ClFormSection, "template_id">;
        Update: Partial<ClFormSection>;
        Relationships: Relationships;
      };
      cl_form_fields: {
        Row: ClFormField;
        Insert: WithDefaults<ClFormField, "template_id" | "label" | "type">;
        Update: Partial<ClFormField>;
        Relationships: Relationships;
      };
      cl_form_submissions: {
        Row: ClFormSubmission;
        Insert: WithDefaults<ClFormSubmission, "project_id" | "template_id">;
        Update: Partial<ClFormSubmission>;
        Relationships: Relationships;
      };
      cl_public_links: {
        Row: ClPublicLink;
        Insert: WithDefaults<ClPublicLink, "token" | "project_id" | "created_by">;
        Update: Partial<ClPublicLink>;
        Relationships: Relationships;
      };
      cl_designers: {
        Row: ClDesigner;
        Insert: WithDefaults<ClDesigner, "name" | "created_by">;
        Update: Partial<ClDesigner>;
        Relationships: Relationships;
      };
      cl_project_designers: {
        Row: ClProjectDesigner;
        Insert: WithDefaults<ClProjectDesigner, "project_id" | "designer_id">;
        Update: Partial<ClProjectDesigner>;
        Relationships: Relationships;
      };
      cl_office_settings: {
        Row: ClOfficeSettings;
        Insert: WithDefaults<ClOfficeSettings, "user_id">;
        Update: Partial<ClOfficeSettings>;
        Relationships: Relationships;
      };
      cl_submission_values: {
        Row: ClSubmissionValue;
        Insert: WithDefaults<ClSubmissionValue, "submission_id" | "field_id">;
        Update: Partial<ClSubmissionValue>;
        Relationships: Relationships;
      };
      cl_submission_values_matrix: {
        Row: ClSubmissionValueMatrix;
        Insert: WithDefaults<
          ClSubmissionValueMatrix,
          "submission_id" | "field_id" | "env_key"
        >;
        Update: Partial<ClSubmissionValueMatrix>;
        Relationships: Relationships;
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
