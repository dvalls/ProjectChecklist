"use client";

import { type ReactNode } from "react";
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import {
  parseTableAnswer,
  parseTableDefinition,
  resolveTable,
  tableHasVisibleText,
} from "@/lib/forms/table";
import { plainTextFromHtml } from "@/lib/rich-text";
import type {
  ClFormField,
  ClFormSection,
  ClFormSubmission,
  ClSubmissionValue,
  ClSubmissionValueMatrix,
  FieldOptions,
} from "@/lib/supabase/types";

import type { PublicFullReport, ReportTemplateEntry } from "../actions";
import {
  formatDateTime,
  formatFieldValue,
  worksheetBlank,
  worksheetBlankIsShort,
  worksheetChoices,
  type WorksheetChoice,
} from "./format-value";
import { PdfRichLabel } from "./pdf-rich-label";

const ACCENT = "#475569"; // slate-600 (barras/bordas)
const ACCENT_DARK = "#1e293b"; // slate-800 (texto forte)
const ACCENT_LIGHT = "#f1f5f9"; // slate-100 (fundos)
const BADGE_BG = "#f1f5f9"; // slate-100 — fundo do badge
const INFO_BG = "#e8edf2";

Font.register({
  family: "Condensed",
  fonts: [
    { src: "/fonts/RobotoCondensed-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/RobotoCondensed-Bold.ttf", fontWeight: 700 },
  ],
});

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
  sectionBadge: {
    fontSize: 8,
    fontFamily: "Condensed",
    fontWeight: 700,
    color: "#111111",
    backgroundColor: BADGE_BG,
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    alignSelf: "flex-start",
    marginTop: 2,
    marginBottom: 4,
  },
  questionBadge: {
    alignSelf: "flex-start",
    backgroundColor: BADGE_BG,
    borderRadius: 3,
    paddingVertical: 1,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  questionTitle: {
    fontSize: 7,
    fontFamily: "Condensed",
    fontWeight: 700,
    color: "#111111",
    lineHeight: 1.1,
  },
  // Dois campos por coluna — label mais estreito
  fieldRow: {
    flexDirection: "row",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderBottom: "0.5pt solid #f1f5f9",
  },
  fieldRowNoLine: {
    borderBottomWidth: 0,
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
  matrixEnvName: {
    width: "75%",
    fontSize: 7,
    fontFamily: "Condensed",
    fontWeight: 700,
    color: "#111111",
    paddingRight: 4,
    lineHeight: 1.1,
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
  infoNote: {
    backgroundColor: INFO_BG,
    borderRadius: 3,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  infoNoteTitle: {
    fontSize: 8,
    fontFamily: "Condensed",
    fontWeight: 700,
    color: "#111111",
    lineHeight: 1.15,
  },
  infoNoteBody: {
    fontSize: 8,
    fontFamily: "Condensed",
    fontWeight: 400,
    color: "#111111",
    lineHeight: 1.3,
    marginTop: 1,
  },
  bodyText: {
    fontSize: 7,
    color: "#111111",
    fontFamily: "Condensed",
    fontWeight: 400,
    lineHeight: 1.1,
  },
  answerText: {
    fontSize: 7,
    color: "#111111",
    fontFamily: "Condensed",
    fontWeight: 700,
    lineHeight: 1.1,
  },
  choiceList: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  choiceListIndent: {
    paddingLeft: 10,
    marginTop: 1,
  },
  choiceItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginRight: 12,
    marginBottom: 2,
  },
  choiceRing: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 0.7,
    borderColor: "#111111",
    marginRight: 3,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceFill: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#111111",
  },
  writeLine: {
    borderBottom: "0.6pt solid #94a3b8",
    height: 10,
    marginTop: 2,
  },
  tableGrid: {
    borderTop: "0.5pt solid #e2e8f0",
    borderLeft: "0.5pt solid #e2e8f0",
    marginTop: 2,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: ACCENT_LIGHT,
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: ACCENT_DARK,
    padding: 3,
    borderRight: "0.5pt solid #e2e8f0",
    borderBottom: "0.5pt solid #e2e8f0",
  },
  tableBodyRow: {
    flexDirection: "row",
  },
  tableBodyCell: {
    flex: 1,
    padding: 3,
    borderRight: "0.5pt solid #e2e8f0",
    borderBottom: "0.5pt solid #e2e8f0",
  },
  tableCellText: {
    fontSize: 7,
    lineHeight: 1.15,
  },
  tableEnv: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#64748b",
    marginTop: 3,
    marginBottom: 2,
  },
  writeLineTall: {
    height: 28,
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

function ChoiceMarks({
  choices,
  indent = false,
}: {
  choices: WorksheetChoice[];
  indent?: boolean;
}) {
  return (
    <View
      style={indent ? [styles.choiceList, styles.choiceListIndent] : styles.choiceList}
    >
      {choices.map((choice, index) => (
        <View key={`${choice.label}-${index}`} wrap={false} style={styles.choiceItem}>
          <View style={styles.choiceRing}>
            {choice.selected ? <View style={styles.choiceFill} /> : null}
          </View>
          <Text style={choice.selected ? styles.answerText : styles.bodyText}>
            {stripEmoji(choice.label)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function WriteLine({ tall = false }: { tall?: boolean }) {
  return (
    <View style={tall ? [styles.writeLine, styles.writeLineTall] : styles.writeLine} />
  );
}

function infoText(field: ClFormField): string {
  const opts = (field.options as Exclude<FieldOptions, null>) ?? {};
  const content = opts.content ?? field.help_text ?? "";
  if (!content.trim()) return "";
  const plain = content.includes("<") ? plainTextFromHtml(content) : content.trim();
  return stripEmoji(plain);
}

function QuestionBadge({ html }: { html: string }) {
  return (
    <View style={styles.questionBadge}>
      <PdfRichLabel html={html} style={styles.questionTitle} />
    </View>
  );
}

function InfoNote({ field }: { field: ClFormField }) {
  const body = infoText(field);
  return (
    <View wrap={false} style={styles.infoNote}>
      {field.label ? (
        <PdfRichLabel html={field.label} style={styles.infoNoteTitle} />
      ) : null}
      {body ? <Text style={styles.infoNoteBody}>{body}</Text> : null}
    </View>
  );
}

function isPlainTextField(field: ClFormField) {
  return field.type === "text" || field.type === "textarea";
}

function BlankField({ field }: { field: ClFormField }) {
  const blank = worksheetBlank(field);
  const text = blank.kind === "text" ? stripEmoji(blank.text) : null;
  const writeIn =
    !isPlainTextField(field) && (blank.kind === "line" || blank.kind === "block");

  if (isPlainTextField(field) || blank.kind === "block" || blank.kind === "text") {
    return (
      <View
        wrap={false}
        style={[
          styles.fieldRow,
          styles.fieldRowStacked,
          isPlainTextField(field) ? styles.fieldRowNoLine : {},
        ]}
      >
        <QuestionBadge html={field.label} />
        {isPlainTextField(field) ? null : text ? (
          <Text style={styles.questionTitle}>{text}</Text>
        ) : writeIn ? (
          <WriteLine tall />
        ) : null}
      </View>
    );
  }

  return (
    <View wrap={false} style={styles.fieldRow}>
      <View style={{ width: "75%" }}>
        <QuestionBadge html={field.label} />
      </View>
      <View style={{ width: "25%" }}>{writeIn ? <WriteLine /> : null}</View>
    </View>
  );
}

function PdfTableGrid({
  field,
  raw,
  worksheet,
}: {
  field: ClFormField;
  raw: string | null;
  worksheet: boolean;
}) {
  const resolved = resolveTable(
    parseTableDefinition(field.options),
    parseTableAnswer(raw),
  );
  if (resolved.columns.length === 0) {
    return worksheet ? <WriteLine /> : <Text style={styles.fieldValue}>—</Text>;
  }

  return (
    <View style={styles.tableGrid}>
      <View style={styles.tableHeaderRow}>
        {resolved.columns.map((column) => (
          <Text key={column.id} style={styles.tableHeaderCell}>
            {stripEmoji(column.label) || " "}
          </Text>
        ))}
      </View>
      {resolved.rows.map((row) => (
        <View key={row.id} style={styles.tableBodyRow} wrap={false}>
          {row.cells.map((cell) => {
            const text = stripEmoji(cell.text).trim();
            return (
              <View key={cell.columnId} style={styles.tableBodyCell}>
                {text ? (
                  <Text style={cell.locked ? styles.tableCellText : styles.answerText}>
                    {text}
                  </Text>
                ) : worksheet ? (
                  <WriteLine />
                ) : (
                  <Text style={styles.tableCellText}> </Text>
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function FieldRow({
  field,
  rawValue = null,
  formattedValue,
  imgUrl,
  isAlt,
  worksheet = false,
}: {
  field: ClFormField;
  rawValue?: string | null;
  formattedValue: string;
  imgUrl: string | null;
  isAlt: boolean;
  worksheet?: boolean;
}) {
  if (worksheet && field.type === "info") {
    return <InfoNote field={field} />;
  }

  if (field.type === "table") {
    return (
      <View style={{ marginBottom: 4 }}>
        {worksheet ? (
          <QuestionBadge html={field.label} />
        ) : (
          <PdfRichLabel
            html={field.label}
            style={[styles.fieldLabel, styles.fieldLabelStacked]}
          />
        )}
        <PdfTableGrid field={field} raw={rawValue} worksheet={worksheet} />
        {imgUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={imgUrl} style={styles.answerImage} />
        ) : null}
      </View>
    );
  }

  const rowBg = worksheet || !isAlt ? {} : styles.fieldRowAlt;
  const choices = worksheet ? worksheetChoices(field, rawValue) : null;
  if (choices) {
    return (
      <View wrap={false} style={[styles.fieldRow, styles.fieldRowStacked, rowBg]}>
        <QuestionBadge html={field.label} />
        <ChoiceMarks choices={choices} indent />
        {imgUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={imgUrl} style={styles.answerImage} />
        ) : null}
      </View>
    );
  }

  if (worksheet && !imgUrl && formattedValue === "—") {
    return <BlankField field={field} />;
  }

  const textAnswer = worksheet && isPlainTextField(field);
  const answered = worksheet && formattedValue !== "—";
  const valueStyle = textAnswer
    ? styles.questionTitle
    : answered
      ? styles.answerText
      : styles.fieldValue;
  const labelStyle = worksheet ? styles.questionTitle : {};

  const isStacked =
    STACKED_FIELD_TYPES.has(field.type) ||
    (formattedValue !== "—" && !isShortYesNo(formattedValue));

  if (isStacked) {
    return (
      <View
        wrap={false}
        style={[
          styles.fieldRow,
          styles.fieldRowStacked,
          rowBg,
          textAnswer ? styles.fieldRowNoLine : {},
        ]}
      >
        {worksheet ? (
          <QuestionBadge html={field.label} />
        ) : (
          <PdfRichLabel
            html={field.label}
            style={[styles.fieldLabel, styles.fieldLabelStacked, labelStyle]}
          />
        )}
        <Text style={valueStyle}>{formattedValue}</Text>
        {imgUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image src={imgUrl} style={styles.answerImage} />
        ) : null}
      </View>
    );
  }

  return (
    <View
      wrap={false}
      style={[styles.fieldRow, rowBg, textAnswer ? styles.fieldRowNoLine : {}]}
    >
      {worksheet ? (
        <View style={{ width: "75%" }}>
          <QuestionBadge html={field.label} />
        </View>
      ) : (
        <PdfRichLabel
          html={field.label}
          style={[styles.fieldLabel, { width: "75%" }, labelStyle]}
        />
      )}
      <View style={{ width: "25%" }}>
        <Text style={valueStyle}>{formattedValue}</Text>
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
  worksheet = false,
}: {
  entry: ReportTemplateEntry;
  submissionValues: ClSubmissionValue[];
  submissionMatrix: ClSubmissionValueMatrix[];
  publicBaseUrl: string;
  worksheet?: boolean;
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
        if (f.type === "info") return worksheet;
        if (worksheet) return true;
        if (isMatrix) return true; // matrix fields filtered per-environment below
        if (f.type === "table") {
          return tableHasVisibleText(f, valuesByField.get(f.id)?.value ?? null);
        }
        const v = valuesByField.get(f.id);
        return isFilled(v?.value, v?.image_url);
      });
      if (visible.length === 0) return null;
      return { section, visible };
    })
    .filter((x): x is { section: ClFormSection; visible: ClFormField[] } => Boolean(x));

  if (renderedSections.length === 0) {
    return (
      <Text style={styles.emptyState}>
        {worksheet ? "Sem perguntas neste formulário." : "Sem respostas registradas."}
      </Text>
    );
  }

  return (
    <View>
      {renderedSections.map(({ section, visible }) => {
        if (isMatrix) {
          return (
            <View key={section.id} style={{ marginBottom: 6 }}>
              {section.title ? (
                <Text
                  style={worksheet ? styles.sectionBadge : styles.formSectionTitle}
                  minPresenceAhead={worksheet ? 72 : undefined}
                >
                  {section.title}
                </Text>
              ) : null}
              {visible.map((field) => {
                if (worksheet && field.type === "info") {
                  return <InfoNote key={field.id} field={field} />;
                }
                if (field.type === "table") {
                  const envs = worksheet
                    ? environments
                    : environments.filter((env) =>
                        tableHasVisibleText(
                          field,
                          matrixByKey.get(`${field.id}::${env}`)?.value ?? null,
                        ),
                      );
                  if (envs.length === 0) return null;
                  return (
                    <View key={field.id} style={styles.matrixBlock}>
                      {worksheet ? (
                        <QuestionBadge html={field.label} />
                      ) : (
                        <PdfRichLabel
                          html={field.label}
                          style={styles.matrixFieldLabel}
                        />
                      )}
                      {envs.map((env) => (
                        <View key={env}>
                          <Text
                            style={
                              worksheet
                                ? [styles.matrixEnvName, { width: "100%" }]
                                : styles.tableEnv
                            }
                          >
                            {env}
                          </Text>
                          <PdfTableGrid
                            field={field}
                            raw={matrixByKey.get(`${field.id}::${env}`)?.value ?? null}
                            worksheet={worksheet}
                          />
                        </View>
                      ))}
                    </View>
                  );
                }
                const filledEnvs = environments.filter((env) => {
                  const v = matrixByKey.get(`${field.id}::${env}`);
                  return isFilled(v?.value, v?.image_url);
                });
                const rowEnvs = worksheet ? environments : filledEnvs;
                if (rowEnvs.length === 0) {
                  if (!worksheet) return null;
                  const blank = worksheetBlank(field);
                  return (
                    <View key={field.id} style={styles.matrixBlock}>
                      {worksheet ? (
                        <QuestionBadge html={field.label} />
                      ) : (
                        <PdfRichLabel
                          html={field.label}
                          style={styles.matrixFieldLabel}
                        />
                      )}
                      {isPlainTextField(field) ? null : blank.kind === "text" ? (
                        <Text style={styles.questionTitle}>{stripEmoji(blank.text)}</Text>
                      ) : (
                        <WriteLine tall={blank.kind === "block"} />
                      )}
                    </View>
                  );
                }
                // Se todas as respostas forem curtas (Sim/Não), mantém a grade
                // compacta de 3 colunas; caso contrário (texto longo, listas de
                // equipamentos...), usa coluna única em largura total e empilhada.
                // No checklist completo, célula vazia de Sim/Não também fica na grade.
                // No checklist com perguntas, as opções ficam na mesma linha do
                // ambiente (30/70), com folga entre elas. A grade de 3 colunas
                // continua só no relatório de respostas curtas.
                const showsChoices = worksheet && worksheetChoices(field, null) !== null;
                const allShort =
                  !showsChoices &&
                  rowEnvs.every((env) => {
                    const v = matrixByKey.get(`${field.id}::${env}`);
                    if (!isFilled(v?.value, v?.image_url)) {
                      return worksheet && worksheetBlankIsShort(field);
                    }
                    return isShortYesNo(formatFieldValue(field, v?.value ?? null));
                  });
                // Respostas longas: coluna única em largura total, mas com ambiente
                // e valor na MESMA linha (ambiente estreito, valor ocupando o resto).
                const wide = !allShort;
                const numCols = allShort ? 3 : 1;
                const perCol = Math.ceil(rowEnvs.length / numCols);
                const envCols =
                  numCols === 3
                    ? [
                        rowEnvs.slice(0, perCol),
                        rowEnvs.slice(perCol, perCol * 2),
                        rowEnvs.slice(perCol * 2),
                      ]
                    : [rowEnvs];
                return (
                  <View key={field.id} style={styles.matrixBlock} wrap={worksheet}>
                    {worksheet ? (
                      <QuestionBadge html={field.label} />
                    ) : (
                      <PdfRichLabel html={field.label} style={styles.matrixFieldLabel} />
                    )}
                    <View style={{ flexDirection: "row" }}>
                      {envCols.map((envCol, ci) => (
                        <View key={ci} style={{ flex: 1, marginRight: ci < 2 ? 6 : 0 }}>
                          {envCol.map((env) => {
                            const v = matrixByKey.get(`${field.id}::${env}`);
                            const imgUrl = buildImageUrl(
                              publicBaseUrl,
                              v?.image_url ?? null,
                            );
                            const filled = isFilled(v?.value, v?.image_url);
                            const formatted = formatFieldValue(field, v?.value ?? null);
                            const choices = worksheet
                              ? worksheetChoices(field, v?.value ?? null)
                              : null;
                            const plainText = worksheet && isPlainTextField(field);
                            const blank =
                              worksheet && !filled && !choices && !plainText
                                ? worksheetBlank(field)
                                : null;
                            const valueWidth = wide ? "70%" : "25%";
                            const valueStyle = plainText
                              ? styles.questionTitle
                              : worksheet
                                ? filled
                                  ? styles.answerText
                                  : styles.bodyText
                                : styles.matrixValue;
                            const envStyle = worksheet
                              ? [styles.matrixEnvName, wide ? { width: "30%" } : {}]
                              : [styles.matrixEnv, wide ? { width: "30%" } : {}];
                            return (
                              <View key={env} style={{ marginBottom: 2 }}>
                                <View
                                  style={
                                    choices
                                      ? [styles.matrixRow, { alignItems: "flex-start" }]
                                      : styles.matrixRow
                                  }
                                >
                                  <Text style={envStyle}>{env}</Text>
                                  {choices ? (
                                    <View style={{ width: valueWidth }}>
                                      <ChoiceMarks choices={choices} />
                                    </View>
                                  ) : blank && blank.kind !== "text" ? (
                                    <View style={{ width: valueWidth }}>
                                      <WriteLine tall={blank.kind === "block"} />
                                    </View>
                                  ) : plainText && !filled ? null : (
                                    <Text style={[valueStyle, { width: valueWidth }]}>
                                      {blank?.kind === "text"
                                        ? stripEmoji(blank.text)
                                        : formatted}
                                    </Text>
                                  )}
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

        const questions = worksheet ? visible.filter((f) => f.type !== "info") : visible;
        const notes = worksheet ? visible.filter((f) => f.type === "info") : [];
        const tables = questions.filter((f) => f.type === "table");
        const rest = questions.filter((f) => f.type !== "table");
        const half = Math.ceil(rest.length / 2);
        const col1 = rest.slice(0, half);
        const col2 = rest.slice(half);

        return (
          <View key={section.id} style={{ marginBottom: 8 }}>
            {section.title ? (
              <Text
                style={worksheet ? styles.sectionBadge : styles.formSectionTitle}
                minPresenceAhead={worksheet ? 72 : undefined}
              >
                {section.title}
              </Text>
            ) : null}
            {notes.map((field) => (
              <InfoNote key={field.id} field={field} />
            ))}
            {tables.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                rawValue={valuesByField.get(field.id)?.value ?? null}
                formattedValue={formatFieldValue(
                  field,
                  valuesByField.get(field.id)?.value ?? null,
                )}
                imgUrl={buildImageUrl(
                  publicBaseUrl,
                  valuesByField.get(field.id)?.image_url ?? null,
                )}
                isAlt={false}
                worksheet={worksheet}
              />
            ))}
            {worksheet ? (
              col1.map((field, idx) => (
                <View key={field.id} wrap={false} style={{ flexDirection: "row" }}>
                  <View style={{ flex: 1, marginRight: 4 }}>
                    <FieldRow
                      field={field}
                      rawValue={valuesByField.get(field.id)?.value ?? null}
                      formattedValue={formatFieldValue(
                        field,
                        valuesByField.get(field.id)?.value ?? null,
                      )}
                      imgUrl={buildImageUrl(
                        publicBaseUrl,
                        valuesByField.get(field.id)?.image_url ?? null,
                      )}
                      isAlt={false}
                      worksheet={worksheet}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 4 }}>
                    {col2[idx] ? (
                      <FieldRow
                        field={col2[idx]}
                        rawValue={valuesByField.get(col2[idx].id)?.value ?? null}
                        formattedValue={formatFieldValue(
                          col2[idx],
                          valuesByField.get(col2[idx].id)?.value ?? null,
                        )}
                        imgUrl={buildImageUrl(
                          publicBaseUrl,
                          valuesByField.get(col2[idx].id)?.image_url ?? null,
                        )}
                        isAlt={false}
                        worksheet={worksheet}
                      />
                    ) : null}
                  </View>
                </View>
              ))
            ) : (
              <View style={{ flexDirection: "row" }}>
                <View style={{ flex: 1, marginRight: 4 }}>
                  {col1.map((field, idx) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      rawValue={valuesByField.get(field.id)?.value ?? null}
                      formattedValue={formatFieldValue(
                        field,
                        valuesByField.get(field.id)?.value ?? null,
                      )}
                      imgUrl={buildImageUrl(
                        publicBaseUrl,
                        valuesByField.get(field.id)?.image_url ?? null,
                      )}
                      isAlt={idx % 2 === 1}
                      worksheet={worksheet}
                    />
                  ))}
                </View>
                <View style={{ flex: 1, marginLeft: 4 }}>
                  {col2.map((field, idx) => (
                    <FieldRow
                      key={field.id}
                      field={field}
                      rawValue={valuesByField.get(field.id)?.value ?? null}
                      formattedValue={formatFieldValue(
                        field,
                        valuesByField.get(field.id)?.value ?? null,
                      )}
                      imgUrl={buildImageUrl(
                        publicBaseUrl,
                        valuesByField.get(field.id)?.image_url ?? null,
                      )}
                      isAlt={idx % 2 === 1}
                      worksheet={worksheet}
                    />
                  ))}
                </View>
              </View>
            )}
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

function mergeWorksheet(entry: ReportTemplateEntry) {
  const sorted = [...entry.submissions].sort((a, b) => {
    const left = a.submission.submitted_at ?? a.submission.created_at;
    const right = b.submission.submitted_at ?? b.submission.created_at;
    return left.localeCompare(right);
  });

  const valuesByField = new Map<string, ClSubmissionValue>();
  const matrixByKey = new Map<string, ClSubmissionValueMatrix>();
  const names: string[] = [];

  for (const item of sorted) {
    const name = item.submission.client_name ?? item.submission.client_email ?? "Anônimo";
    if (!names.includes(name)) names.push(name);
    for (const value of item.values) {
      if (!isFilled(value.value, value.image_url)) continue;
      valuesByField.set(value.field_id, value);
    }
    for (const value of item.matrixValues) {
      if (!isFilled(value.value, value.image_url)) continue;
      matrixByKey.set(`${value.field_id}::${value.env_key}`, value);
    }
  }

  const latest = sorted.at(-1);
  return {
    values: Array.from(valuesByField.values()),
    matrixValues: Array.from(matrixByKey.values()),
    names,
    latestAt: latest
      ? (latest.submission.submitted_at ?? latest.submission.created_at)
      : null,
  };
}

function PageChrome({
  projectName,
  children,
}: {
  projectName: string;
  children: ReactNode;
}) {
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageHeader} fixed>
        <Text style={styles.pageHeaderText}>{stripEmoji(projectName)}</Text>
        <Text style={styles.pageHeaderText}>Checklist</Text>
      </View>
      {children}
      <Text
        style={styles.footer}
        render={({ pageNumber, totalPages }) =>
          `${stripEmoji(projectName)}  ·  página ${pageNumber} de ${totalPages}`
        }
        fixed
      />
    </Page>
  );
}

export function ReportDocument({
  data,
  worksheet = false,
}: {
  data: PublicFullReport;
  worksheet?: boolean;
}) {
  if (worksheet) {
    return (
      <Document
        title={`Checklist — ${data.project.name}`}
        author={data.office?.office_name ?? undefined}
      >
        <Cover data={data} />
        {data.templates.length === 0 ? (
          <PageChrome projectName={data.project.name}>
            <Text style={styles.emptyState}>
              Nenhum formulário público neste projeto.
            </Text>
          </PageChrome>
        ) : (
          data.templates.map((entry) => {
            const merged = mergeWorksheet(entry);
            return (
              <PageChrome key={entry.template.id} projectName={data.project.name}>
                <View style={styles.templateBlock}>
                  <View style={styles.templateHeader}>
                    <Text style={styles.templateTitle}>
                      {stripEmoji(entry.template.name)}
                    </Text>
                    {entry.template.description ? (
                      <Text style={styles.templateMeta}>
                        {entry.template.description}
                      </Text>
                    ) : null}
                    <Text style={styles.templateMeta}>
                      {merged.names.length > 0
                        ? `Respondido por ${merged.names.join(", ")} · último envio em ${formatDateTime(merged.latestAt)}`
                        : "Sem preenchimento — espaço em branco para a reunião"}
                    </Text>
                  </View>
                  <SectionedFields
                    entry={entry}
                    submissionValues={merged.values}
                    submissionMatrix={merged.matrixValues}
                    publicBaseUrl={data.publicBaseUrl}
                    worksheet
                  />
                </View>
              </PageChrome>
            );
          })
        )}
      </Document>
    );
  }

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
