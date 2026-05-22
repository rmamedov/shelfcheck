import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'fs/promises';
import path from 'path';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

async function getImageAsBase64(
  imageUrl: string
): Promise<{ base64: string; mediaType: ImageMediaType }> {
  if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('/')) {
    const filePath = path.join(process.cwd(), 'public', imageUrl);
    const buffer = await readFile(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(imageUrl).toLowerCase();
    const mediaTypeMap: Record<string, ImageMediaType> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const mediaType = mediaTypeMap[ext] || 'image/jpeg';
    return { base64, mediaType };
  }

  const response = await fetch(imageUrl);
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const contentType = (response.headers.get('content-type') || 'image/jpeg') as ImageMediaType;
  return { base64, mediaType: contentType };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { auditId, shelfLevel, photoUrl, planogramUrl, shelfNumber } = body;

    if (!auditId || !photoUrl) {
      return NextResponse.json(
        { error: 'auditId and photoUrl are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // Get the audit to find the shelf
    const audit = await prisma.audit.findUnique({
      where: { id: auditId },
      include: {
        shelf: {
          include: {
            planogramImages: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    const client = new Anthropic({ apiKey });

    // Build planogram image blocks
    const planogramImageBlocks: Anthropic.Messages.ContentBlockParam[] = [];

    // Use multi-image planogram if available, fallback to single planogramUrl
    const planogramImages = audit.shelf.planogramImages;
    if (planogramImages.length > 0) {
      planogramImageBlocks.push({
        type: 'text',
        text: `PLANOGRAM (intended shelf layout) for rack "${audit.shelf.shelfNumber}". This planogram consists of ${planogramImages.length} section(s):`,
      });

      for (const pImg of planogramImages) {
        try {
          const img = await getImageAsBase64(pImg.imageUrl);
          if (pImg.label) {
            planogramImageBlocks.push({
              type: 'text',
              text: `Section: ${pImg.label}`,
            });
          }
          planogramImageBlocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mediaType,
              data: img.base64,
            },
          });
        } catch {
          // Skip broken images
        }
      }
    } else if (planogramUrl) {
      try {
        const planogram = await getImageAsBase64(planogramUrl);
        planogramImageBlocks.push({
          type: 'text',
          text: 'PLANOGRAM (intended shelf layout):',
        });
        planogramImageBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: planogram.mediaType,
            data: planogram.base64,
          },
        });
      } catch {
        return NextResponse.json(
          { error: 'Failed to load planogram image' },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'No planogram images found for this shelf' },
        { status: 400 }
      );
    }

    // Load actual shelf photo
    const photo = await getImageAsBase64(photoUrl);

    const prompt = `You are a retail shelf auditor AI. Compare the actual shelf photo with the planogram image(s). The planogram shows the intended layout for shelf/rack "${shelfNumber || audit.shelf.shelfNumber}". The actual photo shows shelf level ${shelfLevel || 'unknown'}.

Analyze the differences between what should be on the shelf (planogram) and what is actually there (photo). Consider:
- Missing products (in planogram but not on actual shelf)
- Misplaced products (present but in wrong position)
- Extra products (on shelf but not in planogram)

Return ONLY a JSON object with:
{
  "complianceScore": number (0-100, where 100 means perfect match),
  "violations": [
    {
      "type": "missing" | "misplaced" | "extra",
      "productName": string,
      "articleNumber": string | null,
      "shelfLevel": ${shelfLevel || 0},
      "position": number,
      "description": string (in Ukrainian)
    }
  ],
  "summary": string (brief summary in Ukrainian)
}

Return ONLY the JSON, no other text.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            ...planogramImageBlocks,
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: photo.mediaType,
                data: photo.base64,
              },
            },
            {
              type: 'text',
              text: `This is the ACTUAL SHELF PHOTO. ${prompt}`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json(
        { error: 'No text response from AI' },
        { status: 500 }
      );
    }

    let analysisResult;
    try {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      analysisResult = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI response', raw: textBlock.text },
        { status: 500 }
      );
    }

    // Save violations to database
    if (analysisResult.violations && analysisResult.violations.length > 0) {
      await prisma.violation.createMany({
        data: analysisResult.violations.map(
          (v: {
            type: string;
            productName?: string;
            articleNumber?: string | null;
            shelfLevel?: number;
            position?: number;
            description: string;
          }) => ({
            auditId,
            type: v.type,
            productName: v.productName,
            articleNumber: v.articleNumber,
            shelfLevel: v.shelfLevel ?? shelfLevel,
            position: v.position,
            description: v.description,
            photoUrl,
          })
        ),
      });
    }

    // Update audit compliance score
    if (analysisResult.complianceScore !== undefined) {
      await prisma.audit.update({
        where: { id: auditId },
        data: { complianceScore: analysisResult.complianceScore },
      });
    }

    return NextResponse.json(analysisResult);
  } catch (error) {
    console.error('Failed to analyze shelf:', error);
    return NextResponse.json(
      { error: 'Failed to analyze shelf' },
      { status: 500 }
    );
  }
}
