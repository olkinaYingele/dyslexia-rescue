import { ANTHROPIC_API_KEY } from '../config';

export interface BoundingBox {
  x: number;      // 0..1 relative to image width
  y: number;      // 0..1 relative to image height
  width: number;  // 0..1
  height: number; // 0..1
}

export interface Paragraph {
  id: string;
  text: string;
  index: number;
  box: BoundingBox;
}

export async function extractParagraphs(base64: string): Promise<Paragraph[]> {

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `Look at this image and identify the distinct TEXT BLOCKS (not individual lines).
A block = a group of lines that belong together logically (a title, a paragraph, a column, a section).

Return ONLY this JSON, no explanations:

{
  "paragraphs": [
    {
      "text": "full text of the block, all lines joined",
      "box": { "x": 0.05, "y": 0.10, "width": 0.90, "height": 0.20 }
    }
  ]
}

CRITICAL box rules (values 0.0–1.0, relative to full image dimensions):
- x, y = top-left corner of the bounding box
- width, height = size of the bounding box
- The box must TIGHTLY wrap the actual text pixels — not too big, not too small
- Add ~0.01 padding on each side
- A block with 3 lines of text at 30% height should have y≈0.28, height≈0.12
- NEVER use height < 0.04 for any real text block
- Group related lines into ONE block (e.g. title+subtitle, all date lines together)
- Separate blocks only when there is clear visual separation
- Hebrew order: right-to-left, top-to-bottom`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse response from Claude');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const paragraphs: Paragraph[] = (parsed.paragraphs || []).map(
    (item: { text: string; box: BoundingBox }, index: number) => ({
      id: `p-${index}`,
      text: item.text?.trim() || '',
      index,
      box: item.box || { x: 0, y: index * 0.2, width: 1, height: 0.18 },
    })
  );

  return paragraphs.filter(p => p.text.length > 0);
}
