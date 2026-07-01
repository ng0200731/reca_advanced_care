import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const defaultMaterials = [
  { id: "satin", name: "Satin", imageUrl: "/materials/satin.svg", displayOrder: 1 },
  { id: "cotton", name: "Cotton", imageUrl: "/materials/cotton.svg", displayOrder: 2 },
  { id: "polyester", name: "Polyester", imageUrl: "/materials/polyester.svg", displayOrder: 3 },
];

export async function GET() {
  try {
    let materials = await prisma.material.findMany({
      orderBy: { displayOrder: "asc" },
    });

    if (materials.length === 0) {
      await prisma.material.createMany({ data: defaultMaterials });
      materials = await prisma.material.findMany({
        orderBy: { displayOrder: "asc" },
      });
    }

    return NextResponse.json(materials);
  } catch {
    return NextResponse.json(defaultMaterials);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const material = await prisma.material.create({
      data: {
        name: body.name,
        imageUrl: body.imageUrl,
        displayOrder: body.displayOrder,
      },
    });
    return NextResponse.json(material, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create material" }, { status: 500 });
  }
}
