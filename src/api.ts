const GEMINI_API_KEY = 'AIzaSyDvgorRuU7Lc6bXqT5WlLnm1XRmoqt3FqQ';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

export interface ExtractedField {
  id: string;
  label: string;
  value: string;
  confidence: number;
  status: 'high' | 'medium' | 'low' | 'unmapped';
  page: number;
  category: string;
  subcategory: string;
  bbox: { x: number; y: number; w: number; h: number; page: number };
}

export interface ExtractionResult {
  fields: ExtractedField[];
  rawText: string;
  error?: string;
}

const SYSTEM_PROMPT = `You are a financial statement extraction AI. 
Given an image of a financial document (Balance Sheet, P&L, or Cash Flow), extract ALL line items.

Return ONLY a valid JSON array with no markdown, no explanation, no code blocks.
Each item must have exactly these fields:
{
  "label": "exact line item name from document",
  "value": "numeric value as string, no currency symbols",
  "confidence": 0.0 to 1.0 (how certain you are),
  "category": "balance_sheet" | "profit_loss" | "cash_flow",
  "subcategory": "current_assets" | "non_current_assets" | "current_liabilities" | "non_current_liabilities" | "equity" | "revenue" | "expenses" | "profit" | "other",
  "page": 1
}

Rules:
- confidence 0.95+ for clearly printed numbers
- confidence 0.7-0.94 for numbers that need interpretation  
- confidence below 0.7 for unclear or ambiguous items
- If a line item has no value (header row), skip it
- Extract every single line item you can see`;

const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const buildTreeFromFields = (fields: ExtractedField[]) => {
  const categoryMap: Record<string, Record<string, ExtractedField[]>> = {};

  fields.forEach((f) => {
    if (!categoryMap[f.category]) categoryMap[f.category] = {};
    if (!categoryMap[f.category][f.subcategory])
      categoryMap[f.category][f.subcategory] = [];
    categoryMap[f.category][f.subcategory].push(f);
  });

  const categoryLabels: Record<string, string> = {
    balance_sheet: 'Balance Sheet',
    profit_loss: 'Profit & Loss',
    cash_flow: 'Cash Flow',
  };

  const subcategoryLabels: Record<string, string> = {
    current_assets: 'Current Assets',
    non_current_assets: 'Non-Current Assets',
    current_liabilities: 'Current Liabilities',
    non_current_liabilities: 'Non-Current Liabilities',
    equity: 'Equity',
    revenue: 'Revenue',
    expenses: 'Expenses',
    profit: 'Profit',
    other: 'Other',
  };

  return Object.entries(categoryMap).map(([cat, subcats], ci) => ({
    id: `cat_${ci}`,
    label: categoryLabels[cat] || cat,
    confidence: 1,
    status: 'high' as const,
    children: Object.entries(subcats).map(([subcat, items], si) => ({
      id: `sub_${ci}_${si}`,
      label: subcategoryLabels[subcat] || subcat,
      confidence: 1,
      status: 'high' as const,
      children: items.map((f, ii) => ({
        id: `field_${ci}_${si}_${ii}`,
        label: f.label,
        value: f.value,
        confidence: f.confidence,
        status: f.status,
        bbox: f.bbox || {
          x: 100,
          y: 100 + ii * 30,
          w: 300,
          h: 25,
          page: f.page || 1,
        },
      })),
    })),
  }));
};

export const extractFromFile = async (
  file: File
): Promise<{
  tree: ReturnType<typeof buildTreeFromFields>;
  rawText: string;
  error?: string;
}> => {
  try {
    const base64 = await toBase64(file);
    const mimeType = file.type || 'image/jpeg';

    const body = {
      contents: [
        {
          parts: [
            { text: SYSTEM_PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    };

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error('Gemini API error: ' + err);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
    }

    const parsed = JSON.parse(cleaned);

    const fields: ExtractedField[] = parsed.map(
      (item: Record<string, unknown>, i: number) => ({
        id: `f_${i}`,
        label: String(item.label || ''),
        value: String(item.value || ''),
        confidence: Number(item.confidence) || 0.5,
        status:
          Number(item.confidence) >= 0.9
            ? 'high'
            : Number(item.confidence) >= 0.7
            ? 'medium'
            : Number(item.confidence) > 0
            ? 'low'
            : 'unmapped',
        category: String(item.category || 'other'),
        subcategory: String(item.subcategory || 'other'),
        page: Number(item.page) || 1,
        bbox: {
          x: 100,
          y: 100 + (i % 20) * 30,
          w: 300,
          h: 25,
          page: Number(item.page) || 1,
        },
      })
    );

    return { tree: buildTreeFromFields(fields), rawText: text };
  } catch (err) {
    return { tree: [], rawText: '', error: String(err) };
  }
};
