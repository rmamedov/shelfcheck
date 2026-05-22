import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const audit = await prisma.audit.findUnique({
      where: { id },
      include: {
        store: true,
        shelf: true,
        photos: {
          orderBy: { shelfLevel: 'asc' },
        },
        violations: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!audit) {
      return NextResponse.json(
        { error: 'Audit not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(audit);
  } catch (error) {
    console.error('Failed to fetch audit:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit' },
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
    const { status, complianceScore } = body;

    const audit = await prisma.audit.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(complianceScore !== undefined && { complianceScore }),
      },
      include: {
        store: true,
        shelf: true,
      },
    });

    return NextResponse.json(audit);
  } catch (error) {
    console.error('Failed to update audit:', error);
    return NextResponse.json(
      { error: 'Failed to update audit' },
      { status: 500 }
    );
  }
}
