import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';

export const action: ActionFunction = async ({ request }) => {


const { default: Anthropic } = await import('@anthropic-ai/sdk');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: 'Missing Anthropic API key' }, { status: 500 });
  const body = await request.json();
  const { messages } = body;
  if (!messages) return json({ error: 'Missing messages' }, { status: 400 });

  const prompt = `You are an AI assistant for a Shopify store. Given the chat history, extract the user's intent as a tool_use call.\n\nChat history:\n${messages.map((m: { from: string; message: string }) => `${m.from}: ${m.message}`).join('\n')}\n\nRespond ONLY with a JSON object like {"tool_use": {"name": ..., "parameters": {...}}}`;

  const anthropic = new Anthropic({ apiKey });
  const completion = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 512,
    messages: [
      { role: 'user', content: prompt },
    ],
  });

  let tool_use = null;
  try {
    // If completion.content is an array, extract text
    const contentString = Array.isArray(completion.content)
      ? completion.content.map((block: any) => block.text || '').join('')
      : String(completion.content);

    const match = contentString.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      tool_use = parsed.tool_use;
    }
  } catch (err) {
    return json({ error: 'Failed to parse tool_use from Claude', details: String(err) }, { status: 500 });
  }
  if (!tool_use) return json({ error: 'No tool_use detected' }, { status: 400 });
  return json({ tool_use });
};
