import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(request: Request) {
  const body = await request.json();
  const company = body.company;
  const systemInstruction = 'You are the support assistant for ' + company + '. Only answer support questions.';

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: body.message,
    config: { systemInstruction },
  });
  return Response.json({ answer: response.text });
}
