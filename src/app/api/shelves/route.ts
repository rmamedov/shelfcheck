import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get('storeId');

    const shelves = await prisma.shelf.findMany({
      where: storeId ? { storeId } : undefined,
      include: {
        store: true,
        planogramImages: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { shelfNumber: 'asc' },
    });

    return NextResponse.json(shelves);
  } catch (error) {
    console.error('Failed to fetch shelves:', error);
    return NextResponse.json(
      { error: 'Failed to fetch shelves' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, shelfNumber, category, shelvesCount, planogramUrl } = body;

    if (!storeId || !shelfNumber) {
      return NextResponse.json(
        { error: 'storeId and shelfNumber are required' },
        { status: 400 }
      );
    }

    const shelf = await prisma.shelf.create({
      data: {
        storeId,
        shelfNumber,
        category,
        shelvesCount: shelvesCount ?? 6,
        planogramUrl,
      },
    });

    return NextResponse.json(shelf, { status: 201 });
  } catch (error) {
    console.error('Failed to create shelf:', error);
    return NextResponse.json(
      { error: 'Failed to create shelf' },
      { status: 500 }
    );
  }
}
