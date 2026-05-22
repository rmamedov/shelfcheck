import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const products = await prisma.planogramProduct.findMany({
      where: { shelfId: id },
      orderBy: [{ shelfLevel: 'asc' }, { position: 'asc' }],
    });
    return NextResponse.json(products);
  } catch (error) {
    console.error('Failed to fetch planogram products:', error);
    return NextResponse.json(
      { error: 'Failed to fetch planogram products' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Support both single product and batch
    const items = Array.isArray(body) ? body : [body];

    const created = await prisma.planogramProduct.createMany({
      data: items.map(
        (item: {
          shelfLevel: number;
          position: number;
          articleNumber: string;
          productName: string;
          brand?: string;
          volume?: string;
          facings?: number;
        }) => ({
          shelfId: id,
          shelfLevel: item.shelfLevel,
          position: item.position,
          articleNumber: item.articleNumber,
          productName: item.productName,
          brand: item.brand,
          volume: item.volume,
          facings: item.facings ?? 1,
        })
      ),
    });

    return NextResponse.json({ count: created.count }, { status: 201 });
  } catch (error) {
    console.error('Failed to create planogram products:', error);
    return NextResponse.json(
      { error: 'Failed to create planogram products' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await prisma.planogramProduct.deleteMany({
      where: { shelfId: id },
    });
    return NextResponse.json({ count: deleted.count });
  } catch (error) {
    console.error('Failed to delete planogram products:', error);
    return NextResponse.json(
      { error: 'Failed to delete planogram products' },
      { status: 500 }
    );
  }
}
