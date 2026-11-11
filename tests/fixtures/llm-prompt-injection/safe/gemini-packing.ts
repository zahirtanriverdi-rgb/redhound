import { GoogleGenAI } from '@google/genai';
import { Router } from 'express';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
export const router = Router();

// User input goes into the user turn only. The system instruction is fixed.
router.post('/api/packing', async (req, res) => {
  const { tourDetails } = req.body;
  const systemInstruction = `You are a hiking packing assistant. Reply with JSON only.`;
  const promptText = `Tour: ${tourDetails.name}, region: ${tourDetails.region}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: promptText,
    config: { systemInstruction },
  });
  res.json(JSON.parse(response.text ?? '{}'));
});
