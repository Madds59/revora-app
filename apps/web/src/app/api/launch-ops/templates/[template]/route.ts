import { NextResponse } from "next/server";

import { buildImportTemplateCsv, getImportTemplate } from "@/lib/import-templates";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ template: string }> },
) {
  const { template } = await params;
  const definition = getImportTemplate(template);
  const csv = buildImportTemplateCsv(template);

  if (!definition || !csv) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${definition.fileName}"`,
    },
  });
}
