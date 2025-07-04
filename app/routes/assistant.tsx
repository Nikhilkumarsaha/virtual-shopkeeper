import type { LoaderFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import * as React from 'react';
import { useState, useEffect } from 'react';

export const loader: LoaderFunction = async () => {
  // Placeholder loader, can fetch user/session info if needed
  return json({});
};

// --- CLIENT SIDE: CHAT UI ---
function ChatBubble({ message, from }: { message: string; from: 'user' | 'assistant' }) {
  return (
    <div style={{
      textAlign: from === 'user' ? 'right' : 'left',
      margin: '8px 0',
    }}>
      <span
        style={{
          display: 'inline-block',
          background: from === 'user' ? '#d1e7dd' : '#f8d7da',
          color: '#222',
          borderRadius: 16,
          padding: '8px 16px',
          maxWidth: 400,
        }}
      >
        {message}
      </span>
    </div>
  );
}

export default function AssistantRoute() {
  const [messages, setMessages] = useState([
    { from: 'assistant', message: 'Hi! I am Nikhil your shop assistant. How can I help you today?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Persistent cart ID management
  function getCartId() {
    return window.localStorage.getItem('shop-assistant-cart-id');
  }
  function setCartId(cartId: string) {
    window.localStorage.setItem('shop-assistant-cart-id', cartId);
  }

  // On mount, fetch active cart if available
  useEffect(() => {
    // Fetch active cart on component mount
    fetch('/api/get-active-cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(res => res.json())
      .then(data => {
        if (data.cartId) setCartId(data.cartId);
      })
      .catch(err => {
        console.log('No active cart found or error fetching cart');
      });
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage = { from: 'user', message: input };
    setMessages((msgs) => [...msgs, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // 1. Call our own API route to get tool_use from Anthropic
      const intentRes = await fetch('/api/anthropic-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] }),
      });
      const intentData = await intentRes.json();
      if (!intentData.tool_use) {
        setMessages((msgs) => [
          ...msgs,
          { from: 'assistant', message: 'Sorry, I could not understand your intent.' },
        ]);
        setLoading(false);
        return;
      }

      // 2. Inject cartId from localStorage if needed
      let toolUse = { ...intentData.tool_use };
      const cartId = typeof window !== 'undefined' ? getCartId() : null;
      if (
        ['add_to_cart', 'remove_from_cart', 'begin_checkout'].includes(toolUse.name) &&
        cartId &&
        (!toolUse.parameters || !toolUse.parameters.cartId)
      ) {
        toolUse = {
          ...toolUse,
          parameters: {
            ...toolUse.parameters,
            cartId,
          },
        };
      }

      // 3. Call /api/mcp.customer with the detected tool_use (customer-facing)
      const mcpRes = await fetch('/api/mcp/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_use: toolUse }),
      });
      const mcpData = await mcpRes.json();

      // 4. Call LLM again to summarize tool result
      const summaryRes = await fetch('/api/anthropic-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            ...messages,
            userMessage,
            { from: 'tool', message: JSON.stringify(mcpData) }
          ]
        }),
      });
      const summaryData = await summaryRes.json();
      const finalMessage = summaryData.message || 'Sorry, I could not summarize the result.';

      setMessages((msgs) => [
        ...msgs,
        { from: 'assistant', message: finalMessage },
      ]);
    } catch (err) {
      setMessages((msgs) => [
        ...msgs,
        { from: 'assistant', message: 'Sorry, there was an error contacting the assistant.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: 24 }}>
      <h1>Shop Assistant Chat</h1>
      <div style={{ minHeight: 300, marginBottom: 16 }}>
        {messages.map((msg, i) => (
          <ChatBubble key={i} message={msg.message} from={msg.from as any} />
        ))}
        {loading && <ChatBubble message="Thinking..." from="assistant" />}
      </div>
      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ccc' }}
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} style={{ padding: '8px 16px', borderRadius: 8 }}>
          Send
        </button>
      </form>
    </div>
  );
}
