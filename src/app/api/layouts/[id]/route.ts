import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const layout = await prisma.layout.findUnique({
      where: { id },
      include: { details: { include: { material: true } } },
    });
    if (!layout) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(layout);
  } catch {
    return NextResponse.json({ error: "Failed to fetch layout" }, { status: 500 });
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

    const hasDetails =
      body.materialId !== undefined ||
      body.sideType !== undefined ||
      body.edgeType !== undefined ||
      body.widthMm !== undefined ||
      body.heightMm !== undefined ||
      body.orientation !== undefined ||
      body.cuttingType !== undefined ||
      body.loopFoldOrientation !== undefined ||
      body.loopMidForm !== undefined ||
      body.loopFoldDistanceMm !== undefined ||
      body.paddingOption !== undefined ||
      body.padding !== undefined ||
      body.paddingRegion2 !== undefined ||
      body.paddingSyncRegions !== undefined ||
      body.viewMode !== undefined ||
      body.isBackFlipped !== undefined;

    if (hasDetails) {
      data.details = {
        upsert: {
          create: {
            materialId: body.materialId,
            sideType: body.sideType ?? "single",
            edgeType: body.edgeType ?? "woven",
            widthMm: body.widthMm,
            heightMm: body.heightMm,
            orientation: body.orientation,
            cuttingType: body.cuttingType,
            loopFoldOrientation: body.loopFoldOrientation ?? null,
            loopMidForm: body.loopMidForm ?? null,
            loopFoldDistanceMm: body.loopFoldDistanceMm ?? null,
            paddingOption: body.paddingOption,
            paddingTop: body.padding?.top,
            paddingRight: body.padding?.right,
            paddingBottom: body.padding?.bottom,
            paddingLeft: body.padding?.left,
            paddingR2Top: body.paddingRegion2?.top ?? 0,
            paddingR2Right: body.paddingRegion2?.right ?? 0,
            paddingR2Bottom: body.paddingRegion2?.bottom ?? 0,
            paddingR2Left: body.paddingRegion2?.left ?? 0,
            paddingSyncRegions: body.paddingSyncRegions ?? null,
            viewMode: body.viewMode ?? "side-by-side",
            isBackFlipped: body.isBackFlipped ?? null,
          },
          update: {
            materialId: body.materialId,
            sideType: body.sideType ?? "single",
            edgeType: body.edgeType ?? "woven",
            widthMm: body.widthMm,
            heightMm: body.heightMm,
            orientation: body.orientation,
            cuttingType: body.cuttingType,
            loopFoldOrientation: body.loopFoldOrientation ?? null,
            loopMidForm: body.loopMidForm ?? null,
            loopFoldDistanceMm: body.loopFoldDistanceMm ?? null,
            paddingOption: body.paddingOption,
            paddingTop: body.padding?.top,
            paddingRight: body.padding?.right,
            paddingBottom: body.padding?.bottom,
            paddingLeft: body.padding?.left,
            paddingR2Top: body.paddingRegion2?.top ?? 0,
            paddingR2Right: body.paddingRegion2?.right ?? 0,
            paddingR2Bottom: body.paddingRegion2?.bottom ?? 0,
            paddingR2Left: body.paddingRegion2?.left ?? 0,
            paddingSyncRegions: body.paddingSyncRegions ?? null,
            viewMode: body.viewMode ?? "side-by-side",
            isBackFlipped: body.isBackFlipped ?? null,
          },
        },
      };
    }

    const layout = await prisma.layout.update({
      where: { id },
      data,
      include: { details: true },
    });

    return NextResponse.json(layout);
  } catch {
    return NextResponse.json({ error: "Failed to update layout" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.layout.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete layout" }, { status: 500 });
  }
}
