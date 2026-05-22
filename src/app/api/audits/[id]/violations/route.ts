import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const violations = await prisma.violation.findMany({
      where: { auditId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(violations);
  } catch (error) {
    console.error('Failed to fetch violations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch violations' },
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
    const {
      type,
      productName,
      articleNumber,
      shelfLevel,
      position,
      description,
      photoUrl,
      comment,
    } = body;

    if (!type || !description) {
      return NextResponse.json(
        { error: 'type and description are required' },
        { status: 400 }
      );
    }

    const violation = await prisma.violation.create({
      data: {
        auditId: id,
        type,
        productName,
        articleNumber,
        shelfLevel,
        position,
        description,
        photoUrl,
        comment,
      },
    });

    return NextResponse.json(violation, { status: 201 });
  } catch (error) {
    console.error('Failed to create violation:', error);
    return NextResponse.json(
      { error: 'Failed to create violation' },
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
    const { violationId, comment, isFixed, fixedPhotoUrl } = body;

    if (!violationId) {
      return NextResponse.json(
        { error: 'violationId is required' },
        { status: 400 }
      );
    }

    // Verify the violation belongs to this audit
    const existing = await prisma.violation.findFirst({
      where: { id: violationId, auditId: id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Violation not found for this audit' },
        { status: 404 }
      );
    }

    const violation = await prisma.violation.update({
      where: { id: violationId },
      data: {
        ...(comment !== undefined && { comment }),
        ...(isFixed !== undefined && { isFixed }),
        ...(fixedPhotoUrl !== undefined && { fixedPhotoUrl }),
      },
    });

    return NextResponse.json(violation);
  } catch (error) {
    console.error('Failed to update violation:', error);
    return NextResponse.json(
      { error: 'Failed to update violation' },
      { status: 500 }
    );
  }
}
