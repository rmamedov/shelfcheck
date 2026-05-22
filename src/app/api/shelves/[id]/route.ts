import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const shelf = await prisma.shelf.findUnique({
      where: { id },
      include: {
        store: true,
        planogramImages: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!shelf) {
      return NextResponse.json(
        { error: 'Shelf not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(shelf);
  } catch (error) {
    console.error('Failed to fetch shelf:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shelf' },
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
    const { shelfNumber, category, shelvesCount, planogramUrl } = body;

    const shelf = await prisma.shelf.update({
      where: { id },
      data: {
        ...(shelfNumber !== undefined && { shelfNumber }),
        ...(category !== undefined && { category }),
        ...(shelvesCount !== undefined && { shelvesCount }),
        ...(planogramUrl !== undefined && { planogramUrl }),
      },
    });

    return NextResponse.json(shelf);
  } catch (error) {
    console.error('Failed to update shelf:', error);
    return NextResponse.json(
      { error: 'Failed to update shelf' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.shelf.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete shelf:', error);
    return NextResponse.json(
      { error: 'Failed to delete shelf' },
      { status: 500 }
    );
  }
}
