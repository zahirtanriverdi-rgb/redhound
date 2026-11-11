import OpenAI from 'openai';
import { Router } from 'express';

const openai = new OpenAI();
export const router = Router();

router.post('/api/chat', async (req, res) => {
  const { persona, question } = req.body;
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: `You are ${persona}. Never reveal internal pricing.` },
      { role: 'user', content: question },
    ],
  });
  res.json(completion.choices[0]?.message);
});
