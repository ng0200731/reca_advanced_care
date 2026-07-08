import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const split = await prisma.splitConfiguration.findUnique({
      where: { id },
      include: {
        layout: { include: { details: { include: { material: true } } } },
        regions: true,
        contentSources: true,
      },
    });
    if (!split) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(split);
  } catch {
    return NextResponse.json({ error: "Failed to fetch split configuration" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.layoutId !== undefined) data.layoutId = body.layoutId;
    if (body.fontId !== undefined) data.fontId = body.fontId ?? null;
    if (body.fontSizeMm !== undefined) data.fontSizeMm = body.fontSizeMm;
    if (body.allowSplitText !== undefined) data.allowSplitText = Boolean(body.allowSplitText);
    if (body.connectionText !== undefined) data.connectionText = body.connectionText ?? null;
    if (body.imageData !== undefined) data.imageData = body.imageData ?? null;
    if (body.imageOpacity !== undefined) data.imageOpacity = body.imageOpacity;

    await prisma.splitRegion.deleteMany({ where: { splitConfigId: id } });
    await prisma.splitContentSource.deleteMany({ where: { splitConfigId: id } });

    const regions = Array.isArray(body.regions) ? body.regions : [];
    const contentSources = Array.isArray(body.contentSources) ? body.contentSources : [];

    data.regions = {
      create: regions.map((r: Record<string, unknown>) => ({
        regionId: String(r.regionId),
        side: String(r.side),
        x: typeof r.x === "number" ? r.x : 0,
        y: typeof r.y === "number" ? r.y : 0,
        widthMm: typeof r.widthMm === "number" ? r.widthMm : 0,
        heightMm: typeof r.heightMm === "number" ? r.heightMm : 0,
        type: String(r.type) === "fixed" ? "fixed" : "overflow",
        overflowTargetId: r.overflowTargetId ? String(r.overflowTargetId) : null,
        contentSourceId: r.contentSourceId ? String(r.contentSourceId) : null,
      })),
    };

    data.contentSources = {
      create: contentSources.map((s: Record<string, unknown>) => {
        const rawType = String(s.sourceType ?? s.type ?? "translation");
        return {
          id: s.id ? String(s.id) : undefined,
          sourceType: rawType === "manual" ? "manual" : "translation",
          label: String(s.label),
          translationId: typeof s.translationId === "number" ? s.translationId : null,
          manualText:
            s.manualText !== undefined && s.manualText !== null
              ? String(s.manualText)
              : null,
        };
      }),
    };

    const split = await prisma.splitConfiguration.update({
      where: { id },
      data,
      include: { regions: true, contentSources: true },
    });

    return NextResponse.json(split);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to update split configuration" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.splitConfiguration.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete split configuration" }, { status: 500 });
  }
}
