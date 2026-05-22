import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const stores = await prisma.store.findMany({
      include: {
        _count: {
          select: { shelves: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(stores);
  } catch (error) {
    console.error('Failed to fetch stores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stores' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, address, floorMapUrl } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Store name is required' },
        { status: 400 }
      );
    }

    const store = await prisma.store.create({
      data: {
        name,
        address,
        floorMapUrl,
      },
    });

    return NextResponse.json(store, { status: 201 });
  } catch (error) {
    console.error('Failed to create store:', error);
    return NextResponse.json(
      { error: 'Failed to create store' },
      { status: 500 }
    );
  }
}
