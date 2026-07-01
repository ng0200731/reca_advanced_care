import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const layouts = await prisma.layout.findMany({
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(layouts);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Layout name is required" }, { status: 400 });
    }
    if (!body.materialId) {
      return NextResponse.json({ error: "Material is required" }, { status: 400 });
    }
    if (!body.padding || typeof body.padding !== "object") {
      return NextResponse.json({ error: "Padding is required" }, { status: 400 });
    }
    if (!body.paddingOption) {
      return NextResponse.json({ error: "Padding option is required" }, { status: 400 });
    }
    if (typeof body.widthMm !== "number" || typeof body.heightMm !== "number") {
      return NextResponse.json({ error: "Label size is required" }, { status: 400 });
    }
    if (!body.orientation) {
      return NextResponse.json({ error: "Orientation is required" }, { status: 400 });
    }
    if (!body.cuttingType) {
      return NextResponse.json({ error: "Cutting type is required" }, { status: 400 });
    }

    const padding = body.padding as Record<string, unknown>;
    const paddingRegion2 = body.paddingRegion2 as Record<string, unknown> | undefined;

    const layout = await prisma.layout.create({
      data: {
        name: body.name,
        details: {
          create: {
            materialId: body.materialId,
            sideType: body.sideType ?? null,
            edgeType: body.edgeType ?? null,
            widthMm: body.widthMm,
            heightMm: body.heightMm,
            orientation: body.orientation,
            cuttingType: body.cuttingType,
            loopFoldOrientation: body.loopFoldOrientation ?? null,
            loopMidForm: body.loopMidForm ?? null,
            loopFoldDistanceMm: body.loopFoldDistanceMm ?? null,
            paddingOption: body.paddingOption,
            paddingTop: typeof padding.top === "number" ? padding.top : 0,
            paddingRight: typeof padding.right === "number" ? padding.right : 0,
            paddingBottom: typeof padding.bottom === "number" ? padding.bottom : 0,
            paddingLeft: typeof padding.left === "number" ? padding.left : 0,
            paddingR2Top: typeof paddingRegion2?.top === "number" ? paddingRegion2.top : 0,
            paddingR2Right: typeof paddingRegion2?.right === "number" ? paddingRegion2.right : 0,
            paddingR2Bottom: typeof paddingRegion2?.bottom === "number" ? paddingRegion2.bottom : 0,
            paddingR2Left: typeof paddingRegion2?.left === "number" ? paddingRegion2.left : 0,
            paddingSyncRegions: body.paddingSyncRegions ?? null,
            viewMode: body.viewMode ?? "side-by-side",
            isBackFlipped: body.isBackFlipped ?? null,
          },
        },
      },
      include: { details: true },
    });

    return NextResponse.json(layout, { status: 201 });
  } catch (e) {
    console.error(e);
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json({ error: "A layout with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to save layout" }, { status: 500 });
  }
}
