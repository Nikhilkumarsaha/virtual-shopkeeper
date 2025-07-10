import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';

export const action: ActionFunction = async ({ request }) => {
  // Use Gemini instead of Anthropic
  const { GoogleGenAI } = await import('@google/genai');

  // Use the provided Gemini API key directly for now
  const apiKey = 'AIzaSyAhwxhTJJSMhrTV-FaTHggEGOzuyyp6GpQ';
  if (!apiKey) return json({ error: 'Missing Gemini API key' }, { status: 500 });
  const body = await request.json();
  const { messages } = body;
  if (!messages) return json({ error: 'Missing messages' }, { status: 400 });

  // Detect if the last message is from 'tool' (tool result)
  const lastMsg = messages[messages.length - 1];
  const isToolResult = lastMsg && lastMsg.from === 'tool';

  let prompt;
  if (isToolResult) {
    // Summarization prompt with markdown image formatting instructions
    prompt = `You are an AI assistant for a Shopify store. Given the following chat history and the result of a tool call, respond to the user in natural language.
If the tool result contains a list of products, always present each product in the following format:
1. Show the product image as a markdown image: ![alt text](image_url)
2. Show the product title
3. Show the price (from the first variant)
If there are multiple products, list them as:
1. image, title, price
2. image, title, price
...and so on.
Use markdown image syntax for the product image. Do not include any raw JSON or code blocks. Be concise and helpful and dont show any links or URLs for any results including checkout related functionalities result also.
During the query products make sure the query results belongs to the similar product title that the user have asked. If it is not similar, then do not include the product in result response
Chat history:
${messages.slice(0, -1).map((m: { from: string; message: string }) => `${m.from}: ${m.message}`).join('\n')}

Tool result:
${lastMsg.message}

Respond with a helpful message for the user, following the above format for product lists.`;
  } else {
    prompt = `You are an AI assistant for a Shopify store. Given the chat history, extract the user's intent as a tool_use call.If the tool result contains a list of products, always present each product in the following format:
1. Show the product image (URL)
2. Show the product title
3. Show the price (from the first variant)
If there are multiple products, list them as:
1. image, title, price
2. image, title, price
...and so on.
\n\nChat history:\n${messages.map((m: { from: string; message: string }) => `${m.from}: ${m.message}`).join('\n')}\n\nRespond ONLY with a single line of valid JSON like {"tool_use": {"name": ..., "parameters": {...}}}.\n\nIMPORTANT:\n- For product search, always use "query_products" as the tool name.\n- For adding to cart, always use "add_to_cart" with parameters: {"cartId": string, "lines": [{"variantId": string, "quantity": number}]} and always assign variantId property value with product name. Do NOT use product_id.\n- For showing, viewing, or displaying the cart, ALWAYS use the tool name "get_cart" with the parameter {"cartId": ...}.\n- Do NOT use "show_cart", "view_cart", or any other tool name for this purpose.\n- For removing items from the cart, always use "remove_from_cart" with parameters: {"cartId": string, "lineIds": [cart line ID(s)]}. The lineIds MUST be the cart line IDs from the cart object, NOT product titles or variant IDs.\n- For checkout always use "begin_checkout" as the tool_name.\n- Do not include any text, markdown, or code blocks before or after the JSON.`;
  }

  const genAI = new GoogleGenAI({ apiKey });

  // List available models for debugging
  try {
    // const modelsList = await genAI.models.list();
    // console.log('Available Gemini models:', modelsList);
  } catch (e) {
    console.log('Error listing Gemini models:', e);
  }
  console.log("promptttttttttttttttttttt", prompt); // Debug output
  try {
    const result = await genAI.models.generateContent({
      model: 'models/gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: isToolResult ? undefined : 'application/json' },
    }); // Debug output
    let text = '';
    if (
      result &&
      Array.isArray(result.candidates) &&
      result.candidates[0]?.content?.parts?.[0]?.text
    ) {
      text = result.candidates[0].content.parts[0].text;
    }
    console.log('Gemini raw response:', text); // Debug output
    if (isToolResult) {
      // Return the summary as a message
      return json({ message: text });
    } else {
      const toolUseJson = extractToolUseJson(text);
      console.log('Extracted tool_use JSON:', toolUseJson); // Debug output
      if (toolUseJson) {
        return json({ tool_use: toolUseJson.tool_use });
      }
      return json({ error: 'No tool_use detected' }, { status: 400 });
    }
  } catch (err) {
    return json({ error: 'Failed to process Gemini response', details: String(err) }, { status: 500 });
  }
};

// Helper to extract the first JSON object from a string and parse it
function extractToolUseJson(text: string): any | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch (e) {
      return null;
    }
  }
  return null;
}
