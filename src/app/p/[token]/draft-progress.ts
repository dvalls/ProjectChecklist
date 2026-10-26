"use client";

export interface DraftProgress {
  done: number;
  total: number;
  doneAll?: number;
  totalAll?: number;
  updatedAt: number;
}

export interface DraftSubmissionValue {
  field_id: string;
  value: string | null;
  image_url: string | null;
}

export interface DraftSubmissionMatrixValue extends DraftSubmissionValue {
  env_key: string;
}

export interface DraftEnvLink {
  target: string;
  source: string;
}

export interface DraftSubmission {
  values: DraftSubmissionValue[];
  matrix_values: DraftSubmissionMatrixValue[];
  env_links?: DraftEnvLink[];
  updatedAt: number;
}

function storageKey(token: string, templateId: string, email: string) {
  return `checklist.public.progress.${token}.${templateId}.${email.toLowerCase()}`;
}

function submissionStorageKey(token: string, templateId: string, email: string) {
  return `checklist.public.submission.${token}.${templateId}.${email.toLowerCase()}`;
}

export function readDraftProgress(
  token: string,
  templateId: string,
  email: string,
): DraftProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(token, templateId, email));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftProgress>;
    if (typeof parsed.done !== "number" || typeof parsed.total !== "number") {
      return null;
    }
    return {
      done: parsed.done,
      total: parsed.total,
      doneAll: typeof parsed.doneAll === "number" ? parsed.doneAll : undefined,
      totalAll: typeof parsed.totalAll === "number" ? parsed.totalAll : undefined,
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function readDraftSubmission(
  token: string,
  templateId: string,
  email: string,
): DraftSubmission | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      submissionStorageKey(token, templateId, email),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftSubmission>;
    const values = Array.isArray(parsed.values) ? parsed.values : [];
    const matrixValues = Array.isArray(parsed.matrix_values) ? parsed.matrix_values : [];
    const rawLinks = Array.isArray(parsed.env_links) ? parsed.env_links : [];
    return {
      values: values
        .filter((v) => typeof v.field_id === "string")
        .map((v) => ({
          field_id: v.field_id,
          value: typeof v.value === "string" ? v.value : null,
          image_url: typeof v.image_url === "string" ? v.image_url : null,
        })),
      matrix_values: matrixValues
        .filter((v) => typeof v.field_id === "string" && typeof v.env_key === "string")
        .map((v) => ({
          field_id: v.field_id,
          env_key: v.env_key,
          value: typeof v.value === "string" ? v.value : null,
          image_url: typeof v.image_url === "string" ? v.image_url : null,
        })),
      env_links: rawLinks
        .filter(
          (link) =>
            link &&
            typeof link.target === "string" &&
            typeof link.source === "string" &&
            link.target !== link.source,
        )
        .map((link) => ({ target: link.target, source: link.source })),
      updatedAt: parsed.updatedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function writeDraftProgress(
  token: string,
  templateId: string,
  email: string,
  progress: Omit<DraftProgress, "updatedAt">,
) {
  if (typeof window === "undefined") return;
  try {
    const payload: DraftProgress = {
      ...progress,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(
      storageKey(token, templateId, email),
      JSON.stringify(payload),
    );
    window.dispatchEvent(
      new CustomEvent("checklist-progress", {
        detail: { token, templateId, email: email.toLowerCase() },
      }),
    );
  } catch {
    // ignore
  }
}

export function writeDraftSubmission(
  token: string,
  templateId: string,
  email: string,
  draft: Omit<DraftSubmission, "updatedAt">,
) {
  if (typeof window === "undefined") return;
  try {
    const payload: DraftSubmission = {
      ...draft,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(
      submissionStorageKey(token, templateId, email),
      JSON.stringify(payload),
    );
    window.dispatchEvent(
      new CustomEvent("checklist-progress", {
        detail: { token, templateId, email: email.toLowerCase() },
      }),
    );
  } catch {
    // ignore
  }
}

export function clearDraftProgress(token: string, templateId: string, email: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(token, templateId, email));
    window.dispatchEvent(
      new CustomEvent("checklist-progress", {
        detail: { token, templateId, email: email.toLowerCase() },
      }),
    );
  } catch {
    // ignore
  }
}

export function clearDraftSubmission(token: string, templateId: string, email: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(submissionStorageKey(token, templateId, email));
    window.dispatchEvent(
      new CustomEvent("checklist-progress", {
        detail: { token, templateId, email: email.toLowerCase() },
      }),
    );
  } catch {
    // ignore
  }
}

export function clearAllDraftsForToken(token: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const progressPrefix = `checklist.public.progress.${token}.`;
    const submissionPrefix = `checklist.public.submission.${token}.`;
    const toRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(progressPrefix) || key.startsWith(submissionPrefix)) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      window.localStorage.removeItem(key);
    }
    if (toRemove.length > 0) {
      window.dispatchEvent(
        new CustomEvent("checklist-progress", {
          detail: { token, templateId: null, email: null },
        }),
      );
    }
    return toRemove.length;
  } catch {
    return 0;
  }
}
