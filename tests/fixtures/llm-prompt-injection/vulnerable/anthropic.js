const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic();

async function summarise(req, res) {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 1024,
    system: `Summarise the document. Reviewer notes: ${req.query.notes}`,
    messages: [{ role: 'user', content: req.body.document }],
  });
  res.json(message.content);
}

module.exports = { summarise };
