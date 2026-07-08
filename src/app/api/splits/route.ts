import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const splits = await prisma.splitConfiguration.findMany({
      select: { id: true, name: true, layoutId: true, layout: { select: { name: true } }, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(splits);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Split configuration name is required" }, { status: 400 });
    }
    if (!body.layoutId) {
      return NextResponse.json({ error: "Layout is required" }, { status: 400 });
    }

    const layout = await prisma.layout.findUnique({ where: { id: body.layoutId } });
    if (!layout) {
      return NextResponse.json({ error: "Layout not found" }, { status: 404 });
    }

    const regions = Array.isArray(body.regions) ? body.regions : [];
    const contentSources = Array.isArray(body.contentSources) ? body.contentSources : [];

    const split = await prisma.splitConfiguration.create({
      data: {
        name: body.name.trim(),
        layoutId: body.layoutId,
        fontId: body.fontId ?? null,
        fontSizeMm: typeof body.fontSizeMm === "number" ? body.fontSizeMm : 3,
        allowSplitText: Boolean(body.allowSplitText),
        connectionText: body.connectionText ?? null,
        imageData: body.imageData ?? null,
        imageOpacity: typeof body.imageOpacity === "number" ? body.imageOpacity : 0.3,
        regions: {
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
        },
        contentSources: {
          create: contentSources.map((s: Record<string, unknown>) => {
            const rawType = String(s.sourceType ?? s.type ?? "translation");
            return {
              id: s.id ? String(s.id) : undefined,
              sourceType: rawType === "manual" ? "manual" : "translation",
              label: String(s.label),
              translationId:
                typeof s.translationId === "number" ? s.translationId : null,
              manualText:
                s.manualText !== undefined && s.manualText !== null
                  ? String(s.manualText)
                  : null,
            };
          }),
        },
      },
      include: { regions: true, contentSources: true },
    });

    return NextResponse.json(split, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to save split configuration" }, { status: 500 });
  }
}
