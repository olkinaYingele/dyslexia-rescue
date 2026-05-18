import { ANTHROPIC_API_KEY } from '../config';

export interface Paragraph {
  id: string;
  text: string;
  index: number;
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
              text: `זוהי תמונה של לוח או דף עם טקסט בעברית.

אנא זהה את כל הפסקאות/הבלוקים של הטקסט בתמונה.
החזר את התשובה בפורמט JSON בלבד, ללא הסברים נוספים:

{
  "paragraphs": [
    "פסקה ראשונה כאן",
    "פסקה שנייה כאן",
    "פסקה שלישית כאן"
  ]
}

חוקים:
- כל פסקה/בלוק נפרד = רכיב נפרד במערך
- שמור על סדר קריאה נכון (מימין לשמאל, מלמעלה למטה)
- אם יש רק בלוק אחד, החזר מערך עם רכיב אחד
- אם אין טקסט עברי, החזר מערך ריק`,
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

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse response from Claude');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const paragraphs: Paragraph[] = (parsed.paragraphs || []).map(
    (text: string, index: number) => ({
      id: `p-${index}`,
      text: text.trim(),
      index,
    })
  );

  return paragraphs;
}
