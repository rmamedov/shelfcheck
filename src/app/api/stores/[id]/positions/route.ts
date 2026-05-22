import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const positions = await prisma.shelfPosition.findMany({
      where: { storeId: id },
      include: {
        shelf: true,
      },
    });

    return NextResponse.json(positions);
  } catch (error) {
    console.error('Failed to fetch shelf positions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shelf positions' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const positions: Array<{
      shelfId: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
    }> = body;

    if (!Array.isArray(positions)) {
      return NextResponse.json(
        { error: 'Request body must be an array of positions' },
        { status: 400 }
      );
    }

    // Delete all existing positions for this store, then recreate
    await prisma.shelfPosition.deleteMany({
      where: { storeId: id },
    });

    if (positions.length > 0) {
      await prisma.shelfPosition.createMany({
        data: positions.map((pos) => ({
          storeId: id,
          shelfId: pos.shelfId,
          x: pos.x,
          y: pos.y,
          width: pos.width ?? 40,
          height: pos.height ?? 40,
        })),
      });
    }

    const updatedPositions = await prisma.shelfPosition.findMany({
      where: { storeId: id },
      include: {
        shelf: true,
      },
    });

    return NextResponse.json(updatedPositions);
  } catch (error) {
    console.error('Failed to update shelf positions:', error);
    return NextResponse.json(
      { error: 'Failed to update shelf positions' },
      { status: 500 }
    );
  }
}
