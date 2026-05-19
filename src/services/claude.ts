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
              text: `You are analyzing an image to help a child with dyslexia. Find all readable TEXT BLOCKS.

This could be a whiteboard, a book page, a worksheet, or a poster.
- IGNORE illustrations, photos, logos, and decorative elements
- ONLY identify areas that contain actual readable text
- Group lines that belong together into ONE block

Return ONLY this JSON, no explanations:

{
  "paragraphs": [
    {
      "text": "full text of the block, all lines joined with spaces",
      "box": { "x": 0.05, "y": 0.10, "width": 0.90, "height": 0.20 }
    }
  ]
}

CRITICAL box rules (values 0.0–1.0, relative to full image size):
- x, y = top-left corner of the text block
- width, height = must TIGHTLY wrap ALL lines of the block
- Measure carefully: if text starts at 15% from top and ends at 35%, use y=0.15, height=0.20
- NEVER height < 0.05 for a real text block
- For books: the story text is ONE block, author line is SEPARATE block
- For whiteboards: each logical section (title, left column, right column) is a block
- Order: top to bottom, right to left for Hebrew`,
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
