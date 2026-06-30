import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile } from "fs/promises";
import { join } from "path";

export async function GET() {
  try {
    const fonts = await prisma.fontFamily.findMany({
      include: { customer: { select: { companyName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(fonts);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch fonts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const customerId = (formData.get("customerId") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["ttf", "otf"].includes(ext)) {
      return NextResponse.json({ error: "Only .ttf and .otf files are allowed" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = join(process.cwd(), "public", "fonts", fileName);
    await writeFile(filePath, buffer);

    const font = await prisma.fontFamily.create({
      data: {
        name: file.name.replace(/\.[^/.]+$/, ""),
        fileName: file.name,
        filePath: `/fonts/${fileName}`,
        customerId,
      },
      include: { customer: { select: { companyName: true } } },
    });

    return NextResponse.json(font, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to upload font" }, { status: 500 });
  }
}
