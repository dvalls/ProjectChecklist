"use client";

import { DownloadReportActions } from "@/app/p/[token]/pdf/download-buttons";

import { getProjectFullReport } from "./actions";

export function ProjectFullReportButton({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  return (
    <DownloadReportActions
      projectName={projectName}
      loadReport={() => getProjectFullReport(projectId)}
    />
  );
}
