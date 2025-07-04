import * as React from 'react';
import { useState, useEffect } from 'react';

export default function WidgetAssistant() {
  const [messages, setMessages] = useState([
    { from: 'assistant', message: 'Hi! I am your shop assistant. How can I help you today?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPassword, setCustomerPassword] = useState('');
  const [customerToken, setCustomerToken] = useState<string | null>(null);
  const [loginError, setLoginError] = useState('');

  function getCartId() {
    return window.localStorage.getItem('shop-assistant-cart-id');
  }
  function setCartId(cartId: string) {
    window.localStorage.setItem('shop-assistant-cart-id', cartId);
  }
  function getCustomerAccessToken() {
    return window.localStorage.getItem('shop-customer-access-token');
  }
  function setCustomerAccessToken(token: string) {
    window.localStorage.setItem('shop-customer-access-token', token);
    setCustomerToken(token);
  }
  function clearCustomerAccessToken() {
    window.localStorage.removeItem('shop-customer-access-token');
    setCustomerToken(null);
  }

  useEffect(() => {
    const token = getCustomerAccessToken();
    if (token) {
      setCustomerToken(token);
      fetch('/api/get-active-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerAccessToken: token }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.cartId) setCartId(data.cartId);
        });
    }
  }, []);

  async function handleCustomerLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch('/api/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: customerEmail, password: customerPassword }),
      });
      const data = await res.json();
      if (data.accessToken) {
        setCustomerAccessToken(data.accessToken);
        setCustomerEmail('');
        setCustomerPassword('');
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (err) {
      setLoginError('Login failed');
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage = { from: 'user', message: input };
    setMessages((msgs) => [...msgs, userMessage]);
    setInput('');
    setLoading(true);

    try {
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
      const mcpRes = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_use: toolUse }),
      });
      const mcpData = await mcpRes.json();
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

  return (
    <div style={{ maxWidth: 400, margin: '0 auto', padding: 0, background: 'white', height: '100vh', display: 'flex', flexDirection: 'column', borderRadius: 16 }}>
      {/* Customer Login UI */}
      {customerToken ? (
        <div style={{ marginBottom: 16 }}>
          <span>Logged in as customer</span>
          <button onClick={clearCustomerAccessToken} style={{ marginLeft: 8 }}>Logout</button>
        </div>
      ) : (
        <form onSubmit={handleCustomerLogin} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="email"
            value={customerEmail}
            onChange={e => setCustomerEmail(e.target.value)}
            placeholder="Customer Email"
            required
            style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ccc' }}
          />
          <input
            type="password"
            value={customerPassword}
            onChange={e => setCustomerPassword(e.target.value)}
            placeholder="Password"
            required
            style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #ccc' }}
          />
          <button type="submit" style={{ padding: '8px 16px', borderRadius: 8 }}>
            Login
          </button>
        </form>
      )}
      {loginError && <div style={{ color: 'red', marginBottom: 8 }}>{loginError}</div>}
      <div style={{ minHeight: 300, marginBottom: 16, flex: 1, overflowY: 'auto' }}>
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
