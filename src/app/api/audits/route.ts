import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get('storeId');

    const audits = await prisma.audit.findMany({
      where: storeId ? { storeId } : undefined,
      include: {
        store: true,
        shelf: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(audits);
  } catch (error) {
    console.error('Failed to fetch audits:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audits' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, shelfId, merchandiserName } = body;

    if (!storeId || !shelfId) {
      return NextResponse.json(
        { error: 'storeId and shelfId are required' },
        { status: 400 }
      );
    }

    const audit = await prisma.audit.create({
      data: {
        storeId,
        shelfId,
        merchandiserName,
      },
      include: {
        store: true,
        shelf: true,
      },
    });

    return NextResponse.json(audit, { status: 201 });
  } catch (error) {
    console.error('Failed to create audit:', error);
    return NextResponse.json(
      { error: 'Failed to create audit' },
      { status: 500 }
    );
  }
}
