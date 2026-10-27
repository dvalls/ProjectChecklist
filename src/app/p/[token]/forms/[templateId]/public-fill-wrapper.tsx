"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import type { ClFormField, ClFormSection, ClFormTemplate } from "@/lib/supabase/types";

import { readIdentity, type PublicIdentity } from "../../identity-storage";
import { PreviewBanner } from "../../preview-banner";
import { PREVIEW_IDENTITY, withPreview } from "../../preview-mode";
import { PublicFooter, type PublicOfficeSettings } from "../../public-footer";
import { PublicFormsFlow } from "../../public-forms-flow";

export interface PreviousFieldValue {
  value: string | null;
  image_url: string | null;
  submission_id: string;
  client_name: string | null;
  client_email: string | null;
  filled_at: string | null;
}

export type PreviousValuesMap = Record<string, PreviousFieldValue>;
export type PreviousMatrixValuesMap = Record<string, Record<string, PreviousFieldValue>>;

interface Props {
  token: string;
  template: ClFormTemplate;
  sections: ClFormSection[];
  fields: ClFormField[];
  officeSettings: PublicOfficeSettings | null;
  previousByField: PreviousValuesMap;
  previousByMatrix: PreviousMatrixValuesMap;
  allowResubmit: boolean;
  preview?: boolean;
}

export function PublicFillWrapper({
  token,
  template,
  sections,
  fields,
  officeSettings,
  previousByField,
  previousByMatrix,
  allowResubmit,
  preview = false,
}: Props) {
  const router = useRouter();
  const [identity, setIdentity] = useState<PublicIdentity | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (preview) {
      setIdentity(PREVIEW_IDENTITY);
      setHydrated(true);
      return;
    }
    const saved = readIdentity(token);
    setHydrated(true);
    if (!saved) {
      router.replace(`/p/${token}`);
      return;
    }
    setIdentity(saved);
  }, [preview, token, router]);

  if (!hydrated || !identity) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary dark:bg-background">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const backHref = withPreview(`/p/${token}/forms`, preview);

  return (
    <div className="flex min-h-screen flex-col bg-secondary dark:bg-background">
      <div className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={backHref}
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar à lista
          </Link>
          <div className="flex items-center gap-1">
            {preview ? null : (
              <div className="min-w-0 text-left text-xs text-muted-foreground sm:text-right">
                <div className="truncate font-medium text-foreground">
                  {identity.client_name}
                </div>
                <div className="truncate">{identity.client_email}</div>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-3 py-4 sm:px-4 sm:py-8">
        {preview ? <PreviewBanner /> : null}
        <PublicFormsFlow
          token={token}
          template={template}
          sections={sections}
          fields={fields}
          identity={identity}
          previousByField={previousByField}
          previousByMatrix={previousByMatrix}
          allowResubmit={allowResubmit}
          preview={preview}
        />

        <div className="mt-6 flex justify-start">
          <Link
            href={backHref}
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar à lista
          </Link>
        </div>
      </div>

      <PublicFooter officeSettings={officeSettings} />
    </div>
  );
}
