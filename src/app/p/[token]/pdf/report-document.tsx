"use client";

import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type {
  ClFormField,
  ClFormSection,
  ClFormSubmission,
  ClSubmissionValue,
  ClSubmissionValueMatrix,
} from "@/lib/supabase/types";

import type { PublicFullReport, ReportTemplateEntry } from "../actions";
import { formatDateTime, formatFieldValue } from "./format-value";
import { PdfRichLabel } from "./pdf-rich-label";

const ACCENT = "#475569"; // slate-600 (barras/bordas)
const ACCENT_DARK = "#1e293b"; // slate-800 (texto forte)
const ACCENT_LIGHT = "#f1f5f9"; // slate-100 (fundos)

// Dimensões da página (usadas para compensar padding no header fixo)
const PAGE_PADDING_TOP = 46;
const PAGE_PADDING_H = 36;

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PADDING_TOP,
    paddingBottom: 34,
    paddingHorizontal: PAGE_PADDING_H,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#0f172a",
    lineHeight: 1.2,
  },
  coverPage: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  coverHeader: {
    borderBottom: "3pt solid " + ACCENT,
    paddingBottom: 20,
    marginBottom: 20,
  },
  coverKicker: {
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#64748b",
    marginTop: 14,
  },
  coverTitle: {
    fontSize: 28,
    marginTop: 6,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  coverDescription: {
    marginTop: 10,
    fontSize: 11,
    color: "#334155",
  },
  coverLogo: {
    maxHeight: 22,
    maxWidth: 90,
    objectFit: "contain",
  },
  coverLogoPlaceholder: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: "#1e293b",
  },
  coverImage: {
    width: "100%",
    height: 200,
    marginTop: 0,
    marginBottom: 0,
    objectFit: "cover",
  },
  coverBody: {
    paddingTop: 0,
  },
  sectionHeading: {
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#64748b",
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
    marginTop: 20,
  },
  designersGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  designerCard: {
    width: "33.33%",
    padding: 4,
  },
  designerInner: {
    border: "1pt solid #e2e8f0",
    borderRadius: 4,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  designerPhoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    objectFit: "cover",
  },
  designerName: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  designerRole: {
    fontSize: 8,
    color: "#64748b",
  },
  disciplinesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  disciplineChip: {
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 9,
    marginRight: 6,
    marginBottom: 6,
    color: ACCENT_DARK,
    fontFamily: "Helvetica-Bold",
  },
  // Header fixo: margem negativa para sangrar além do padding da página
  pageHeader: {
    marginTop: -PAGE_PADDING_TOP,
    marginLeft: -PAGE_PADDING_H,
    marginRight: -PAGE_PADDING_H,
    marginBottom: 22,
    backgroundColor: "#000000",
    paddingVertical: 6,
    paddingHorizontal: PAGE_PADDING_H,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pageHeaderText: {
    fontSize: 7,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  templateBlock: {
    marginBottom: 12,
  },
  templateHeader: {
    borderBottom: "1.5pt solid " + ACCENT,
    paddingBottom: 8,
    marginBottom: 10,
  },
  templateTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    lineHeight: 1.2,
  },
  templateMeta: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 3,
  },
  submissionBlock: {
    marginBottom: 10,
    borderLeft: "2pt solid " + ACCENT,
    paddingLeft: 8,
  },
  submissionHeader: {
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  submissionName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: ACCENT_DARK,
  },
  submissionMeta: {
    color: "#64748b",
    fontSize: 8,
    marginTop: 1,
  },
  formSectionTitle: {
    borderLeft: "3pt solid " + ACCENT,
    backgroundColor: ACCENT_LIGHT,
    color: "#1e293b",
    paddingVertical: 2,
    paddingHorizontal: 6,
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  // Dois campos por coluna — label mais estreito
  fieldRow: {
    flexDirection: "row",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderBottom: "0.5pt solid #f1f5f9",
  },
  fieldRowStacked: {
    flexDirection: "column",
  },
  fieldRowAlt: {
    backgroundColor: "#f8fafc",
  },
  fieldLabel: {
    fontSize: 8,
    color: "#64748b",
    fontFamily: "Helvetica-Bold",
    paddingRight: 6,
    lineHeight: 1.1,
  },
  fieldLabelStacked: {
    width: "100%",
    paddingRight: 0,
    marginBottom: 1,
  },
  fieldValue: {
    fontSize: 8,
    lineHeight: 1.1,
  },
  matrixBlock: {
    border: "1pt solid #e2e8f0",
    borderRadius: 3,
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  matrixFieldLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    marginBottom: 3,
  },
  matrixRow: {
    flexDirection: "row",
    marginBottom: 1,
    lineHeight: 1,
  },
  matrixEnv: {
    width: "75%",
    fontSize: 8,
    color: "#64748b",
    fontFamily: "Helvetica-Bold",
    paddingRight: 4,
    lineHeight: 1,
  },
  matrixValue: {
    width: "25%",
    fontSize: 8,
    lineHeight: 1,
  },
  matrixEnvStacked: {
    width: "100%",
    paddingRight: 0,
  },
  matrixValueStacked: {
    width: "100%",
    fontSize: 8,
    lineHeight: 1,
  },
  answerImage: {
    marginTop: 6,
    maxHeight: 120,
    maxWidth: 200,
    objectFit: "contain",
  },
  imageTag: {
    fontSize: 8,
    color: "#64748b",
    marginTop: 2,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 36,
    right: 36,
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
  },
  muted: {
    color: "#64748b",
  },
  emptyState: {
    color: "#64748b",
    fontStyle: "italic",
    fontSize: 10,
  },
});

function buildImageUrl(baseUrl: string, path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl}/${path}`;
}

// A fonte Helvetica do PDF não renderiza emojis (ex.: o ⚡ vira "¡").
// Removemos pictogramas/emojis do texto exibido no PDF.
function stripEmoji(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Tipos de texto livre: resposta vai abaixo da pergunta, ocupando 100%.
// Demais (checkbox, select, radio, date, number...): pergunta 75% / resposta 25%.
const STACKED_FIELD_TYPES = new Set<ClFormField["type"]>(["text", "textarea"]);

// Respostas curtas (Sim/Não) ficam bem na coluna de 25%; qualquer outra resposta
// é empilhada (label numa linha, valor na seguinte) para não espremer/quebrar o texto.
function isShortYesNo(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "sim" || normalized === "não" || normalized === "nao";
}

function FieldRow({
  field,
  formattedValue,
  imgUrl,
  isAlt,
}: {
  field: ClFormField;
  formattedValue: string;
  imgUrl: string | null;
  isAlt: boolean;
}) {
  const isStacked =
    STACKED_FIELD_TYPES.has(field.type) ||
    (formattedValue !== "—" && !isShortYesNo(formattedValue));

  if (isStacked) {
    return (
      <View
        wrap={false}
        style={[styles.fieldRow, styles.fieldRowStacked, isAlt ? styles.fieldRowAlt : {}]}
      >
        <PdfRichLabel
          html={field.label}
          style={[styles.fieldLabel, styles.fieldLabelStacked]}
        />
        <Text style={styles.fieldValue}>{formattedValue}</Text>
        {imgUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={imgUrl} style={styles.answerImage} />
        ) : null}
      </View>
    );
  }

  return (
    <View wrap={false} style={[styles.fieldRow, isAlt ? styles.fieldRowAlt : {}]}>
      <PdfRichLabel html={field.label} style={[styles.fieldLabel, { width: "75%" }]} />
      <View style={{ width: "25%" }}>
        <Text style={styles.fieldValue}>{formattedValue}</Text>
        {imgUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={imgUrl} style={styles.answerImage} />
        ) : null}
      </View>
    </View>
  );
}

function isFilled(value: string | null | undefined, imageUrl: string | null | undefined) {
  return (value !== null && value !== undefined && value !== "") || !!imageUrl;
}

function SectionedFields({
  entry,
  submissionValues,
  submissionMatrix,
  publicBaseUrl,
}: {
  entry: ReportTemplateEntry;
  submissionValues: ClSubmissionValue[];
  submissionMatrix: ClSubmissionValueMatrix[];
  publicBaseUrl: string;
}) {
  const { template, sections, fields } = entry;
  const isMatrix = template.layout_mode === "matrix";
  const environments = (template.environments ?? []) as string[];

  const valuesByField = new Map(submissionValues.map((v) => [v.field_id, v] as const));
  const matrixByKey = new Map(
    submissionMatrix.map((v) => [`${v.field_id}::${v.env_key}`, v] as const),
  );

  const sectionsToRender: ClFormSection[] =
    sections.length > 0
      ? sections
      : [
          {
            id: "_default",
            template_id: template.id,
            title: "",
            subtitle: null,
            columns: 3,
            position: 0,
            created_at: "",
          },
        ];

  const renderedSections = sectionsToRender
    .map((section) => {
      const secFields =
        sections.length > 0 ? fields.filter((f) => f.section_id === section.id) : fields;
      const visible = secFields.filter((f) => {
        if (f.type === "info") return false;
        if (isMatrix) return true; // matrix fields filtered per-environment below
        const v = valuesByField.get(f.id);
        return isFilled(v?.value, v?.image_url);
      });
      if (visible.length === 0) return null;
      return { section, visible };
    })
    .filter((x): x is { section: ClFormSection; visible: ClFormField[] } => Boolean(x));

  if (renderedSections.length === 0) {
    return <Text style={styles.emptyState}>Sem respostas registradas.</Text>;
  }

  return (
    <View>
      {renderedSections.map(({ section, visible }) => {
        if (isMatrix) {
          return (
            <View key={section.id} style={{ marginBottom: 6 }}>
              {section.title ? (
                <Text style={styles.formSectionTitle}>{section.title}</Text>
              ) : null}
              {visible.map((field) => {
                const filledEnvs = environments.filter((env) => {
                  const v = matrixByKey.get(`${field.id}::${env}`);
                  return isFilled(v?.value, v?.image_url);
                });
                if (filledEnvs.length === 0) return null;
                // Se todas as respostas forem curtas (Sim/Não), mantém a grade
                // compacta de 3 colunas; caso contrário (texto longo, listas de
                // equipamentos...), usa coluna única em largura total e empilhada.
                const allShort = filledEnvs.every((env) => {
                  const v = matrixByKey.get(`${field.id}::${env}`);
                  return isShortYesNo(formatFieldValue(field, v?.value ?? null));
                });
                // Respostas longas: coluna única em largura total, mas com ambiente
                // e valor na MESMA linha (ambiente estreito, valor ocupando o resto).
                const wide = !allShort;
                const numCols = allShort ? 3 : 1;
                const perCol = Math.ceil(filledEnvs.length / numCols);
                const envCols =
                  numCols === 3
                    ? [
                        filledEnvs.slice(0, perCol),
                        filledEnvs.slice(perCol, perCol * 2),
                        filledEnvs.slice(perCol * 2),
                      ]
                    : [filledEnvs];
                return (
                  <View key={field.id} style={styles.matrixBlock} wrap={false}>
                    <PdfRichLabel html={field.label} style={styles.matrixFieldLabel} />
                    <View style={{ flexDirection: "row" }}>
                      {envCols.map((envCol, ci) => (
                        <View key={ci} style={{ flex: 1, marginRight: ci < 2 ? 6 : 0 }}>
                          {envCol.map((env) => {
                            const v = matrixByKey.get(`${field.id}::${env}`);
                            const imgUrl = buildImageUrl(
                              publicBaseUrl,
                              v?.image_url ?? null,
                            );
                            const formatted = formatFieldValue(field, v?.value ?? null);
                            return (
                              <View key={env} style={{ marginBottom: 2 }}>
                                <View style={styles.matrixRow}>
                                  <Text
                                    style={[
                                      styles.matrixEnv,
                                      wide ? { width: "30%" } : {},
                                    ]}
                                  >
                                    {env}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.matrixValue,
                                      wide ? { width: "70%" } : {},
                                    ]}
                                  >
                                    {formatted}
                                  </Text>
                                </View>
                                {imgUrl ? (
                                  // eslint-disable-next-line jsx-a11y/alt-text
                                  <Image src={imgUrl} style={styles.answerImage} />
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        }

        // Layout de duas colunas para campos normais
        const half = Math.ceil(visible.length / 2);
        const col1 = visible.slice(0, half);
        const col2 = visible.slice(half);

        return (
          <View key={section.id} style={{ marginBottom: 8 }}>
            {section.title ? (
              <Text style={styles.formSectionTitle}>{section.title}</Text>
            ) : null}
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1, marginRight: 4 }}>
                {col1.map((field, idx) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    formattedValue={formatFieldValue(
                      field,
                      valuesByField.get(field.id)?.value ?? null,
                    )}
                    imgUrl={buildImageUrl(
                      publicBaseUrl,
                      valuesByField.get(field.id)?.image_url ?? null,
                    )}
                    isAlt={idx % 2 === 1}
                  />
                ))}
              </View>
              <View style={{ flex: 1, marginLeft: 4 }}>
                {col2.map((field, idx) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    formattedValue={formatFieldValue(
                      field,
                      valuesByField.get(field.id)?.value ?? null,
                    )}
                    imgUrl={buildImageUrl(
                      publicBaseUrl,
                      valuesByField.get(field.id)?.image_url ?? null,
                    )}
                    isAlt={idx % 2 === 1}
                  />
                ))}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Cover({ data }: { data: PublicFullReport }) {
  const { project, office, designers, disciplines, publicBaseUrl } = data;
  const logoUrl = buildImageUrl(publicBaseUrl, office?.logo_url ?? null);
  const coverUrl = buildImageUrl(publicBaseUrl, project.image_url);

  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverHeader}>
        {logoUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={logoUrl} style={styles.coverLogo} />
        ) : office?.office_name ? (
          <Text style={styles.coverLogoPlaceholder}>{office.office_name}</Text>
        ) : null}
        <Text style={styles.coverKicker}>Checklist do projeto</Text>
        <Text style={styles.coverTitle}>{stripEmoji(project.name)}</Text>
        {project.description ? (
          <Text style={styles.coverDescription}>{project.description}</Text>
        ) : null}
      </View>

      {coverUrl ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image src={coverUrl} style={styles.coverImage} />
      ) : null}

      <View style={styles.coverBody}>
        {designers.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading}>Projetistas</Text>
            <View style={styles.designersGrid}>
              {designers.map((d) => {
                const photo = buildImageUrl(publicBaseUrl, d.photo_url);
                return (
                  <View key={d.id} style={styles.designerCard}>
                    <View style={styles.designerInner}>
                      {photo ? (
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <Image src={photo} style={styles.designerPhoto} />
                      ) : (
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            marginRight: 8,
                            backgroundColor: "#e2e8f0",
                          }}
                        />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.designerName}>{d.name}</Text>
                        {d.role ? (
                          <Text style={styles.designerRole}>{d.role}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {disciplines.length > 0 ? (
          <View>
            <Text style={styles.sectionHeading}>Disciplinas</Text>
            <View style={styles.disciplinesRow}>
              {disciplines.map((d) => (
                <Text key={d.id} style={styles.disciplineChip}>
                  {d.name}
                </Text>
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) =>
          `Gerado em ${formatDateTime(data.generatedAt)}  ·  página ${pageNumber} de ${totalPages}`
        }
        fixed
      />
    </Page>
  );
}

function SubmissionBlock({
  entry,
  submission,
  values,
  matrixValues,
  publicBaseUrl,
}: {
  entry: ReportTemplateEntry;
  submission: Pick<
    ClFormSubmission,
    "id" | "client_name" | "client_email" | "submitted_at" | "created_at" | "status"
  >;
  values: ClSubmissionValue[];
  matrixValues: ClSubmissionValueMatrix[];
  publicBaseUrl: string;
}) {
  return (
    <View style={styles.submissionBlock} wrap>
      <View style={styles.submissionHeader} wrap={false}>
        <Text style={styles.submissionName}>{submission.client_name ?? "Anônimo"}</Text>
        <Text style={styles.submissionMeta}>{submission.client_email ?? "—"}</Text>
        <Text style={styles.submissionMeta}>
          Enviado em {formatDateTime(submission.submitted_at ?? submission.created_at)}
        </Text>
      </View>
      <SectionedFields
        entry={entry}
        submissionValues={values}
        submissionMatrix={matrixValues}
        publicBaseUrl={publicBaseUrl}
      />
    </View>
  );
}

export function ReportDocument({ data }: { data: PublicFullReport }) {
  const templatesWithSubmissions = data.templates.filter((t) => t.submissions.length > 0);
  const hasContent = templatesWithSubmissions.length > 0;

  return (
    <Document
      title={`Checklist — ${data.project.name}`}
      author={data.office?.office_name ?? undefined}
    >
      <Cover data={data} />

      {hasContent ? (
        templatesWithSubmissions.map((entry) => (
          <Page key={entry.template.id} size="A4" style={styles.page}>
            <View style={styles.pageHeader} fixed>
              <Text style={styles.pageHeaderText}>{stripEmoji(data.project.name)}</Text>
              <Text style={styles.pageHeaderText}>Checklist</Text>
            </View>
            <View style={styles.templateBlock}>
              <View style={styles.templateHeader}>
                <Text style={styles.templateTitle}>
                  {stripEmoji(entry.template.name)}
                </Text>
                {entry.template.description ? (
                  <Text style={styles.templateMeta}>{entry.template.description}</Text>
                ) : null}
                <Text style={styles.templateMeta}>
                  {entry.submissions.length}{" "}
                  {entry.submissions.length === 1 ? "preenchimento" : "preenchimentos"}
                </Text>
              </View>

              {entry.submissions.map((s) => (
                <SubmissionBlock
                  key={s.submission.id}
                  entry={entry}
                  submission={s.submission}
                  values={s.values}
                  matrixValues={s.matrixValues}
                  publicBaseUrl={data.publicBaseUrl}
                />
              ))}
            </View>

            <Text
              style={styles.footer}
              render={({ pageNumber, totalPages }) =>
                `${stripEmoji(data.project.name)}  ·  página ${pageNumber} de ${totalPages}`
              }
              fixed
            />
          </Page>
        ))
      ) : (
        <Page size="A4" style={styles.page}>
          <View style={styles.pageHeader} fixed>
            <Text style={styles.pageHeaderText}>{stripEmoji(data.project.name)}</Text>
            <Text style={styles.pageHeaderText}>Checklist</Text>
          </View>
          <Text style={styles.emptyState}>
            Nenhum preenchimento registrado neste link.
          </Text>
        </Page>
      )}
    </Document>
  );
}
