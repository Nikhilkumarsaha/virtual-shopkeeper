import type { LoaderFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import * as React from 'react';
import { useState, useEffect } from 'react';

export const loader: LoaderFunction = async () => {
  // Placeholder loader, can fetch user/session info if needed
  return json({});
};

// --- CLIENT SIDE: CHAT UI ---
function renderMessageWithImages(message: string) {
  // Simple regex to match markdown images: ![alt text](url)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = imageRegex.exec(message)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{message.slice(lastIndex, match.index)}</span>);
    }
    parts.push(
      <img
        key={key++}
        src={match[2]}
        alt={match[1] || 'Product'}
        style={{ maxWidth: 40, height: 40, objectFit: 'contain', display: 'inline', verticalAlign: 'middle', margin: '0 8px 0 0' }}
      />
    );
    lastIndex = imageRegex.lastIndex;
  }
  if (lastIndex < message.length) {
    parts.push(<span key={key++}>{message.slice(lastIndex)}</span>);
  }
  return parts;
}

function renderProductList(message: string) {
  // Split into lines and group every 2-3 lines as one product (image, title, price)
  const lines = message.split('\n').map(line => line.trim());

  // Find the index of the first product (line with markdown image or just a number)
  const firstProductIdx = lines.findIndex(line => /^(\d+)\.\s*(?:!\[.*\]\(.*\))?/.test(line));
  const intro = firstProductIdx > 0 ? lines.slice(0, firstProductIdx).join(' ') : '';
  const productLines = lines.slice(firstProductIdx).filter(Boolean);
  console.log("11111111111111", productLines);
  // Find the start of each product (line with markdown image or just a number)
  const products = [];
  let i = 0;
  while (i < productLines.length) {
    // Look for a line starting with a number and a markdown image
    const imgLine = productLines[i].match(/^(\d+)\.\s*!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgLine) {
      // Next lines: title and price
      let title = productLines[i + 1] || '';
      let price = productLines[i + 2] || '';
      // Remove leading numbers and dots from title and price
      title = title.replace(/^\d+\.\s*/, '');
      // price = price.replace(/^\d+\.\s*/, '');
      products.push({
        img: imgLine[3],
        alt: imgLine[2] || 'Product',
        title,
        price,
      });
      i += 3;
    } else {
      // Handle products with no image (just number, title, price)
      const noImgLine = productLines[i].match(/^(\d+)\.\s*(.*)/);
      if (noImgLine) {
        let title = noImgLine[2] || '';
        let price = productLines[i + 1] || '';
        // Remove leading numbers and dots from title and price
        title = title.replace(/^\d+\.\s*/, '');
        // price = price.replace(/^\d+\.\s*/, '');
        products.push({
          img: null,
          alt: '',
          title,
          price,
        });
        i += 2;
      } else {
        i++;
      }
    }
  }

  if (products.length === 0) return null;

  return (
    <div>
      {intro && <div style={{ marginBottom: 8, fontWeight: 500 }}>{intro}</div>}
      {products.map((prod, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: 8, background: '#f6f6f6', borderRadius: 8, padding: 8 }}>
          {prod.img && (
            <img src={prod.img} alt={prod.alt} style={{ width: 40, height: 40, objectFit: 'contain', marginRight: 12 }} />
          )}
          <div>
            <div style={{ fontWeight: 500 }}>{prod.title}</div>
            <div style={{ color: '#555' }}>{prod.price}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatBubble({ message, from }: { message: string; from: 'user' | 'assistant' }) {
  const productList = from === 'assistant' ? renderProductList(message) : null;
  return (
    <div style={{
      textAlign: from === 'user' ? 'right' : 'left',
      margin: '8px 0',
    }}>
      <span
        style={{
          display: 'inline-block',
          background: from === 'user' ? '#d1e7dd' : '#d1d1db',
          color: '#222',
          borderRadius: 16,
          padding: '8px 16px',
          maxWidth: 400,
        }}
      >
        {productList ? productList : renderMessageWithImages(message)}
      </span>
    </div>
  );
}

export default function AssistantRoute() {
  const [messages, setMessages] = useState([
    { from: 'assistant', message: 'Hi! I am your shop assistant. How can I help you today?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPassword, setCustomerPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [customerToken, setCustomerToken] = useState<string | null>(null);
  const [loginSent, setLoginSent] = useState(false);
  const [lastProducts, setLastProducts] = useState<any[]>([]);
  const [lastCart, setLastCart] = useState<any>(null);

  // Persistent cart ID and customer token management
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

  // On mount, fetch active cart and customer token if available
  useEffect(() => {
    const token = getCustomerAccessToken();
    if (token) {
      setCustomerToken(token);
    }
    fetch('/api/get-active-cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerAccessToken: token }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.cartId) setCartId(data.cartId);
      })
      .catch(() => {});
  }, []);

  // Handle login command or button
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].message.trim().toLowerCase() === 'login') {
      setShowLogin(true);
    }
  }, [messages]);

  async function handleCustomerLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    setLoginSent(false);
    try {
      console.log('Attempting customer login:', customerEmail);
      const res = await fetch('/api/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: customerEmail, password: customerPassword }),
      });
      const data = await res.json();
      console.log('Customer login response:', data);
      if (data.accessToken) {
        setCustomerAccessToken(data.accessToken);
        setShowLogin(false);
        setLoginSent(false);
        setCustomerEmail('');
        setCustomerPassword('');
        // Always check for active cart after login, using the user's email
        try {
          console.log('Fetching active cart for:', customerEmail);
          const cartRes = await fetch('/api/get-active-cart', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerAccessToken: data.accessToken, email: customerEmail }),
          });
          const cartData = await cartRes.json();
          console.log('Active cart fetch response:', cartData);
          if (cartData.cartId) {
            setCartId(cartData.cartId);
            console.log('Active cartId set in localStorage:', cartData.cartId);
          } else {
            console.log('Cart creation or fetch failed:', cartData);
          }
        } catch (cartErr) {
          console.log('Error fetching/creating cart after login:', cartErr);
        }
      } else {
        setLoginError(data.error || 'Failed to login');
        console.log('Login error:', data.error || 'Failed to login');
      }
    } catch (err) {
      setLoginError('Failed to login');
      console.log('Exception during login:', err);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    if (input.trim().toLowerCase() === 'login') {
      setShowLogin(true);
      setInput('');
      return;
    }
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
      console.log('Anthropic intent response:', intentData);
      if (!intentData.tool_use) {
        setMessages((msgs) => [
          ...msgs,
          { from: 'assistant', message: 'Sorry, I could not understand your intent.' },
        ]);
        setLoading(false);
        return;
      }

      let toolUse = { ...intentData.tool_use };
      console.log('Tool use detected:', toolUse);
      const cartId = typeof window !== 'undefined' ? getCartId() : null;
      const customerAccessToken = typeof window !== 'undefined' ? getCustomerAccessToken() : null;

      if (
        ['add_to_cart', 'remove_from_cart', 'begin_checkout', 'get_cart'].includes(toolUse.name)
      ) {
        // Always inject the cartId
        toolUse = {
          ...toolUse,
          parameters: {
            ...toolUse.parameters,
            cartId, // always overwrite with the real cartId from localStorage
          },
        };
        // add_to_cart
        if (toolUse.name === 'add_to_cart') {
          const productName = toolUse.parameters?.lines?.[0]?.variantId;
          console.log('Product name to ground:', productName);
          const findProduct = lastProducts.find((p: any) => {
            return p.title.toLowerCase() === productName?.toLowerCase()
          });
          console.log('Found producttttttttttttt:', findProduct);
          const productId = findProduct.variants?.edges?.[0]?.node?.id;
          if (productId) {
            toolUse.parameters.lines[0].variantId = productId;
            console.log('Injecting variantIdddddddddd:', productId);
          }
        //   const firstVariantId = lastProducts[0]?.variants?.edges?.[0]?.node?.id;
        //   if (firstVariantId && toolUse.parameters && toolUse.parameters.lines && toolUse.parameters.lines.length > 0) {
        //     toolUse.parameters.lines[0].variantId = firstVariantId;
        //     console.log('Injecting first variantId from lastProducts:', firstVariantId);
        //   } else {
        //     console.log('No valid lastProducts or variantId to inject.');
        //   }
        }
        // For remove_from_cart, ground the lineIds using lastCart and user intent
        if (toolUse.name === 'remove_from_cart' && lastCart && lastCart.lines && Array.isArray(lastCart.lines.edges)) {
          const userText = userMessage.message.toLowerCase();

          // Try exact or partial match first
          let matchingLine = (lastCart.lines.edges as any[]).find((edge: any) => {
            const productTitle = edge.node.merchandise.product.title.toLowerCase();
            const variantTitle = edge.node.merchandise.title?.toLowerCase() || '';
            return (
              userText === productTitle ||
              userText === variantTitle ||
              userText.includes(productTitle) ||
              userText.includes(variantTitle)
            );
          });

          // If no exact/partial match, try substring match
          if (!matchingLine) {
            matchingLine = (lastCart.lines.edges as any[]).find((edge: any) => {
              const productTitle = edge.node.merchandise.product.title.toLowerCase();
              const variantTitle = edge.node.merchandise.title?.toLowerCase() || '';
              return (
                productTitle.includes(userText) ||
                variantTitle.includes(userText)
              );
            });
          }

          if (matchingLine) {
            toolUse.parameters.lineIds = [matchingLine.node.id];
            console.log('Grounded lineIds for remove_from_cart:', toolUse.parameters.lineIds);
          } else {
            setMessages((msgs) => [
              ...msgs,
              { from: 'assistant', message: 'Sorry, I could not find that product in your cart to remove.' },
            ]);
            setLoading(false);
            return;
          }
        }
        console.log('Preparing cart operation tool call:', toolUse);
      }

      // Add customerAccessToken to API call if present
      console.log('Sending tool call to /api/mcp/customer:', toolUse, 'with customerAccessToken:', customerAccessToken);
      const mcpRes = await fetch('/api/mcp/customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(customerAccessToken ? { 'x-customer-access-token': customerAccessToken } : {}),
        },
        body: JSON.stringify({ tool_use: toolUse }),
      });
      const mcpData = await mcpRes.json();
      console.log('Response from /api/mcp/customer:', mcpData);

      // If this was a product search, update lastProducts with the backend result
      if (toolUse.name === 'query_products' && Array.isArray(mcpData.products)) {
        setLastProducts(mcpData.products);
        console.log('Updated lastProducts from backend:', mcpData.products);
      }
      // If this was a cart operation, update lastCart with the backend result
      if ((toolUse.name === 'get_cart' || toolUse.name === 'add_to_cart' || toolUse.name === 'remove_from_cart') && mcpData.cart) {
        setLastCart(mcpData.cart);
        console.log('Updated lastCart from backend:', mcpData.cart);
      }

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
      console.log('Final assistant message:', finalMessage);

      setMessages((msgs) => [
        ...msgs,
        { from: 'assistant', message: finalMessage },
      ]);
    } catch (err) {
      setMessages((msgs) => [
        ...msgs,
        { from: 'assistant', message: 'Sorry, there was an error contacting the assistant.' },
      ]);
      console.log('Error during add to cart process:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: 24 }}>
      <h1>Shop Assistant Chat</h1>
      {customerToken ? (
        <div style={{ marginBottom: 16 }}>
          <span>Logged in as customer</span>
          <button onClick={clearCustomerAccessToken} style={{ marginLeft: 8, cursor: 'pointer' }}>Logout</button>
        </div>
      ) : (
        !showLogin && (
          <button
            onClick={() => setShowLogin(true)}
            style={{
              marginBottom: 16,
              cursor: 'pointer',
              background: 'linear-gradient(90deg, #6366f1 0%, #60a5fa 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '6px 14px',
              fontWeight: 600,
              fontSize: 14,
              boxShadow: '0 2px 8px rgba(99, 102, 241, 0.10)',
              transition: 'background 0.2s, box-shadow 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'linear-gradient(90deg, #4f46e5 0%, #2563eb 100%)')}
            onMouseOut={e => (e.currentTarget.style.background = 'linear-gradient(90deg, #6366f1 0%, #60a5fa 100%)')}
          >
            Login as Customer
          </button>
        )
      )}
      {showLogin && !customerToken && (
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
          <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
            Login with Shopify
          </button>
          <button type="button" onClick={() => setShowLogin(false)} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
            Cancel
          </button>
        </form>
      )}
      {loginSent && <div style={{ color: 'green', marginBottom: 8 }}>Opening Shopify login page...</div>}
      {loginError && <div style={{ color: 'red', marginBottom: 8 }}>{loginError}</div>}
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
