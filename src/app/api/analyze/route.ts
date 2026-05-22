import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import path from 'path';

// ML service URL (Python FastAPI running on port 8001)
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';

/**
 * Analyze shelf photo against planogram using the local ML recognition service.
 * Falls back to Claude Vision API if ML_SERVICE_URL is not available and ANTHROPIC_API_KEY is set.
 */
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

    // Get the audit to find the shelf and planogram
    const audit = await prisma.audit.findUnique({
      where: { id: auditId },
      include: {
        shelf: {
          include: {
            planogramImages: { orderBy: { sortOrder: 'asc' } },
            planogramProducts: { orderBy: [{ shelfLevel: 'asc' }, { position: 'asc' }] },
          },
        },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    // Try ML service first
    const mlResult = await tryMLService(photoUrl, audit.shelf, shelfLevel, shelfNumber);

    if (mlResult) {
      // Save violations to database
      if (mlResult.violations && mlResult.violations.length > 0) {
        await prisma.violation.createMany({
          data: mlResult.violations.map(
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
      if (mlResult.complianceScore !== undefined) {
        await prisma.audit.update({
          where: { id: auditId },
          data: { complianceScore: mlResult.complianceScore },
        });
      }

      return NextResponse.json(mlResult);
    }

    // Fallback to Claude Vision API
    const claudeResult = await tryClaudeVision(
      photoUrl, planogramUrl, audit, shelfLevel, shelfNumber
    );

    if (!claudeResult) {
      return NextResponse.json(
        { error: 'Neither ML service nor Claude Vision API is available' },
        { status: 500 }
      );
    }

    // Save violations to database
    if (claudeResult.violations && claudeResult.violations.length > 0) {
      await prisma.violation.createMany({
        data: claudeResult.violations.map(
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

    if (claudeResult.complianceScore !== undefined) {
      await prisma.audit.update({
        where: { id: auditId },
        data: { complianceScore: claudeResult.complianceScore },
      });
    }

    return NextResponse.json(claudeResult);
  } catch (error) {
    console.error('Failed to analyze shelf:', error);
    return NextResponse.json(
      { error: 'Failed to analyze shelf' },
      { status: 500 }
    );
  }
}

// -----------------------------------------------------------------------
// ML Service (local Python FastAPI)
// -----------------------------------------------------------------------

interface PlanogramProductData {
  shelfLevel: number;
  position: number;
  articleNumber: string;
  productName: string;
  brand?: string | null;
  volume?: string | null;
  facings: number;
}

interface ShelfData {
  shelfNumber: string;
  planogramImages: { imageUrl: string; label: string | null; sortOrder: number }[];
  planogramProducts?: PlanogramProductData[];
  planogramUrl?: string | null;
}

async function tryMLService(
  photoUrl: string,
  shelf: ShelfData,
  shelfLevel: number,
  shelfNumber: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  try {
    // Check if ML service is healthy
    const healthRes = await fetch(`${ML_SERVICE_URL}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!healthRes.ok) return null;

    // Read the photo file
    const photoPath = photoUrl.startsWith('/')
      ? path.join(process.cwd(), 'public', photoUrl)
      : photoUrl;
    const photoBuffer = await readFile(photoPath);

    // Build planogram JSON for the ML service
    const planogramJson = buildPlanogramJson(shelf, shelfNumber);

    // Send to ML compare endpoint
    const formData = new FormData();
    formData.append(
      'photo',
      new Blob([photoBuffer], { type: 'image/jpeg' }),
      'shelf_photo.jpg'
    );
    formData.append('planogram', JSON.stringify(planogramJson));

    const response = await fetch(`${ML_SERVICE_URL}/api/compare`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(60000), // 60s timeout for ML inference
    });

    if (!response.ok) {
      console.warn('ML service returned error:', response.status);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('ML service not available, falling back to Claude Vision:', error);
    return null;
  }
}

function buildPlanogramJson(shelf: ShelfData, shelfNumber: string) {
  // If we have structured planogram products, use them
  if (shelf.planogramProducts && shelf.planogramProducts.length > 0) {
    const rowMap = new Map<number, PlanogramProductData[]>();
    for (const p of shelf.planogramProducts) {
      if (!rowMap.has(p.shelfLevel)) rowMap.set(p.shelfLevel, []);
      rowMap.get(p.shelfLevel)!.push(p);
    }

    const shelves = Array.from(rowMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([row, products]) => {
        // Group consecutive same-article products as facings
        const slots: { sku_id: string; facings: number }[] = [];
        let prev = '';
        for (const p of products.sort((a, b) => a.position - b.position)) {
          if (p.articleNumber === prev && slots.length > 0) {
            slots[slots.length - 1].facings += 1;
          } else {
            slots.push({ sku_id: p.articleNumber, facings: p.facings });
          }
          prev = p.articleNumber;
        }
        return { row: row - 1, slots }; // convert 1-based to 0-based
      });

    return {
      planogram_id: `shelf_${shelfNumber}`,
      fixture_id: shelfNumber,
      shelves,
    };
  }

  // Fallback: build from planogram images labels
  return {
    planogram_id: `shelf_${shelfNumber}`,
    fixture_id: shelfNumber,
    shelves: [
      {
        row: 0,
        slots: shelf.planogramImages.map((img, idx) => ({
          sku_id: img.label || `ITEM_${idx + 1}`,
          facings: 1,
        })),
      },
    ],
  };
}

// -----------------------------------------------------------------------
// Claude Vision API (fallback)
// -----------------------------------------------------------------------

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryClaudeVision(
  photoUrl: string,
  planogramUrl: string | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  audit: any,
  shelfLevel: number,
  shelfNumber: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });

    // Build planogram image blocks
    const planogramImageBlocks: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = [];

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
        return null;
      }
    } else {
      return null;
    }

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ] as any,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Claude Vision API failed:', error);
    return null;
  }
}
