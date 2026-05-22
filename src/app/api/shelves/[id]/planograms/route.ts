import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const images = await prisma.planogramImage.findMany({
      where: { shelfId: id },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(images);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch planogram images" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const { imageUrl, sortOrder, label } = body;

    if (!imageUrl) {
      return NextResponse.json(
        { error: "imageUrl is required" },
        { status: 400 }
      );
    }

    const image = await prisma.planogramImage.create({
      data: {
        shelfId: id,
        imageUrl,
        sortOrder: sortOrder ?? 0,
        label: label ?? null,
      },
    });

    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create planogram image" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("imageId");

    if (imageId) {
      await prisma.planogramImage.delete({ where: { id: imageId } });
    } else {
      await prisma.planogramImage.deleteMany({ where: { shelfId: id } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete planogram image" },
      { status: 500 }
    );
  }
}
