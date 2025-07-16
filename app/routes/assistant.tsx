import type { LoaderFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';

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
  // Split into lines and group every 2-3 lines as one product (image, title, price, quantity)
  const lines = message.split('\n').map(line => line.trim());

  // Find the index of the first product (line with markdown image or just a number)
  const firstProductIdx = lines.findIndex(line => /^(\d+)\.\s*(?:!\[.*\]\(.*\))?/.test(line));
  const intro = firstProductIdx > 0 ? lines.slice(0, firstProductIdx).join(' ') : '';
  const productLines = lines.slice(firstProductIdx).filter(Boolean);
  // Find the start of each product (line with markdown image or just a number)
  const products = [];
  let i = 0;
  while (i < productLines.length) {
    // Look for a line starting with a number and a markdown image
    const imgLine = productLines[i].match(/^(\d+)\.\s*!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgLine) {
      // Next lines: title, price, quantity (optional)
      let title = productLines[i + 1] || '';
      let price = productLines[i + 2] || '';
      let quantity = '';
      // Check if the next line is quantity
      if (productLines[i + 3] && productLines[i + 3].toLowerCase().startsWith('quantity:')) {
        quantity = productLines[i + 3].replace(/^quantity:\s*/i, '');
        i += 4;
      } else {
        i += 3;
      }
      // Remove leading numbers and dots from title and price
      title = title.replace(/^\d+\.\s*/, '');
      products.push({
        img: imgLine[3],
        alt: imgLine[2] || 'Product',
        title,
        price,
        quantity,
      });
    } else {
      // Handle products with no image (just number, title, price, quantity)
      const noImgLine = productLines[i].match(/^(\d+)\.\s*(.*)/);
      if (noImgLine) {
        let title = noImgLine[2] || '';
        let price = productLines[i + 1] || '';
        let quantity = '';
        if (productLines[i + 2] && productLines[i + 2].toLowerCase().startsWith('quantity:')) {
          quantity = productLines[i + 2].replace(/^quantity:\s*/i, '');
          i += 3;
        } else {
          i += 2;
        }
        title = title.replace(/^\d+\.\s*/, '');
        products.push({
          img: null,
          alt: '',
          title,
          price,
          quantity,
        });
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
            {prod.quantity && (
              <div style={{ color: '#888', fontSize: 13 }}>Quantity: {prod.quantity}</div>
            )}
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
    { from: 'assistant', message: 'Hi! I am your shop assistant. I can help you find products, manage your cart, and answer questions. If you\'re logged in, I\'ll automatically load your cart. How can I help you today?' },
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
  // Track if the last tool call was get_cart to show the checkout button
  const [showCheckoutSuggestion, setShowCheckoutSuggestion] = useState(false);
  // Store the checkout URL for the current cart
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  // Store Shopify customer data from parent window
  const [shopifyCustomer, setShopifyCustomer] = useState<any>(null);
  // Store Shopify cart data from parent window
  const [shopifyCart, setShopifyCart] = useState<any>(null);

  // Persistent cart ID management
  function getCartId() {
    // Prioritize Shopify cart ID if available
    if (shopifyCart && shopifyCart.id) {
      return shopifyCart.id;
    }
    return window.localStorage.getItem('shop-assistant-cart-id');
  }
  
  // Helper function to handle cart operations via postMessage to storefront
  async function handleCartOperation(operation: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const timeoutId = setTimeout(() => {
        reject(new Error('Cart operation timeout'));
      }, 10000);

      const handleResponse = (event: MessageEvent) => {
        if (event.data.requestId === requestId) {
          clearTimeout(timeoutId);
          window.removeEventListener('message', handleResponse);
          
          if (event.data.success) {
            resolve(event.data);
          } else {
            reject(new Error(event.data.error || 'Cart operation failed'));
          }
        }
      };

      window.addEventListener('message', handleResponse);
      
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: operation,
          source: 'plugin',
          requestId,
          ...params
        }, '*');
      } else {
        clearTimeout(timeoutId);
        reject(new Error('No parent window available'));
      }
    });
  }

  // Function to fetch checkout URL for a cart
  const fetchCheckoutUrl = useCallback(async (cartId: string): Promise<void> => {
    try {
      console.log('Fetching checkout URL for cartId:', cartId);
      
      // Validate cart ID
      if (!cartId || cartId === 'null' || cartId === 'undefined') {
        console.log('Invalid cart ID provided for checkout URL:', cartId);
        return;
      }
      
      const response = await fetch('/api/mcp/customer', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tool_use: {
            name: 'begin_checkout',
            parameters: { cartId }
          }
        }),
      });
      
      const data = await response.json();
      console.log('Checkout URL response:', data);
      
      if (data.checkoutUrl) {
        setCheckoutUrl(data.checkoutUrl);
        console.log('Checkout URL set:', data.checkoutUrl);
      } else {
        console.log('No checkout URL received:', data);
        setCheckoutUrl(null);
      }
    } catch (error) {
      console.log('Error fetching checkout URL:', error);
      setCheckoutUrl(null);
    }
  }, []);

  // On mount, just set up basic customer state
  useEffect(() => {
    // No need to fetch customer tokens since cart is managed by storefront
    console.log('Assistant initialized');
  }, []);

  // Listen for customer data from parent window (Shopify store)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('=== ASSISTANT RECEIVED MESSAGE ===');
      if (event.data.type === 'SHOPIFY_CUSTOMER_DATA') {
        const customerData = event.data.customerData;
        const cartData = event.data.cartData;
        const cartToken = event.data.cartToken;
        const sessionToken = event.data.sessionToken;
        
        setShopifyCustomer(customerData);
        setShopifyCart(cartData);
        
        // Implement cart synchronization strategy
        console.log('=== CALLING CART SYNC ===');
        handleCartSync(cartData, cartToken, customerData, sessionToken);
      } else {
        console.log('Received non-Shopify message:', event.data);
      }
    };

    console.log('Setting up message event listener in assistant');
    window.addEventListener('message', handleMessage);
    return () => {
      console.log('Removing message event listener in assistant');
      window.removeEventListener('message', handleMessage);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle login command or button
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].message.trim().toLowerCase() === 'login') {
      console.log('Detected "login" command in messages, showing login form');
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
        // Store token locally for this session only
        setCustomerToken(data.accessToken);
        setShowLogin(false);
        setLoginSent(false);
        setCustomerEmail('');
        setCustomerPassword('');
        
        // Fetch active cart after login - not needed, cart is managed by storefront
        console.log('Customer logged in successfully:', customerEmail);
      } else {
        setLoginError(data.error || 'Failed to login');
        console.log('Login error:', data.error || 'Failed to login');
      }
    } catch (err) {
      setLoginError('Failed to login');
      console.log('Exception during login:', err);
    }
  }

  async function handleSend(e: React.FormEvent, overrideInput?: string) {
    e.preventDefault();
    const messageToSend = overrideInput !== undefined ? overrideInput : input;
    if (!messageToSend.trim()) return;
    if (messageToSend.trim().toLowerCase() === 'login') {
      setShowLogin(true);
      setInput('');
      return;
    }
    const userMessage = { from: 'user', message: messageToSend };
    setMessages((msgs) => [...msgs, userMessage]);
    setInput('');
    setLoading(true);
    setShowCheckoutSuggestion(false); // Hide suggestion while processing

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
      const shopifyCartId = shopifyCart?.id || null;
      const effectiveCartId = shopifyCartId || cartId; // Prefer Shopify cart ID

      if (
        ['add_to_cart', 'remove_from_cart', 'begin_checkout', 'get_cart'].includes(toolUse.name)
      ) {
        // Always inject the effective cartId (prioritizing Shopify cart)
        let finalCartId = effectiveCartId;
        
        // For get_cart specifically, ensure we have the right cart ID format
        if (toolUse.name === 'get_cart') {
          if (shopifyCartId) {
            // Use Shopify cart ID, ensure proper format
            finalCartId = shopifyCartId;
            if (finalCartId && !finalCartId.toString().startsWith('gid://shopify/Cart/')) {
              finalCartId = `gid://shopify/Cart/${finalCartId}`;
            }
            console.log('Using Shopify cart ID for get_cart:', finalCartId);
          } else if (cartId) {
            finalCartId = cartId;
            console.log('Using local cart ID for get_cart:', finalCartId);
          } else {
            console.log('No cart ID available for get_cart, will use fallback data');
          }
        }
        
        toolUse = {
          ...toolUse,
          parameters: {
            ...toolUse.parameters,
            cartId: finalCartId,
          },
        };
        console.log('Using cart ID for operation:', finalCartId, 'tool:', toolUse.name, 'source:', shopifyCartId ? 'shopify' : 'localStorage');
        
        // For add_to_cart, ground the id using lastProducts and user intent
        if (toolUse.name === 'add_to_cart') {
          const productName = toolUse.parameters?.lines?.[0]?.id;
          console.log('Product name to ground:', productName);
          
          if (productName && lastProducts.length > 0) {
            // Try to find matching product in lastProducts
            const findProduct = lastProducts.find((p: any) => {
              return p.title.toLowerCase().includes(productName.toLowerCase()) ||
                     productName.toLowerCase().includes(p.title.toLowerCase());
            });
            
            if (findProduct) {
              const productId = findProduct.variants?.edges?.[0]?.node?.id;
              if (productId) {
                toolUse.parameters.lines[0].id = productId;
                console.log('Grounded id for add_to_cart:', productId);
              }
            } else {
              setMessages((msgs) => [
                ...msgs,
                { from: 'assistant', message: `I couldn't find a product matching "${productName}" in our catalog. Could you please try searching for products first?` },
              ]);
              setLoading(false);
              return;
            }
          } else if (lastProducts.length === 0) {
            setMessages((msgs) => [
              ...msgs,
              { from: 'assistant', message: 'Please search for products first before adding them to your cart.' },
            ]);
            setLoading(false);
            return;
          }
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
        
        // Final validation for add_to_cart - ensure we have an id
        // if (toolUse.name === 'add_to_cart') {
        //   const id = toolUse.parameters?.lines?.[0]?.id;
        //   if (!id || id === toolUse.parameters?.lines?.[0]?.id) {
        //     // Check if the id is still the original product name (not resolved)
        //     const originalProductName = toolUse.parameters?.lines?.[0]?.id;
        //     if (originalProductName && !originalProductName.startsWith('gid://shopify/ProductVariant/')) {
        //       setMessages((msgs) => [
        //         ...msgs,
        //         { from: 'assistant', message: `I couldn't find a product matching "${originalProductName}" in our catalog. Could you please try searching for products first, or provide a more specific product name?` },
        //       ]);
        //       setLoading(false);
        //       return;
        //     }
        //   }
        // }
      }

      // Debug: Log the exact parameters being sent
      if (toolUse.name === 'add_to_cart') {
        console.log('=== ADD_TO_CART PARAMETER DEBUG ===');
        console.log('toolUse.parameters:', JSON.stringify(toolUse.parameters, null, 2));
        console.log('toolUse.parameters.lines:', toolUse.parameters.lines);
        if (toolUse.parameters.lines && toolUse.parameters.lines[0]) {
          console.log('First line id:', toolUse.parameters.lines[0].id);
        }
        console.log('=== END PARAMETER DEBUG ===');
      }
      
      let mcpData: any;
      
      // Handle cart operations via postMessage to storefront
      if (['add_to_cart', 'remove_from_cart', 'get_cart'].includes(toolUse.name)) {
        try {
          console.log('Handling cart operation via postMessage:', toolUse.name, toolUse.parameters);
          
          if (toolUse.name === 'add_to_cart') {
            // Extract variant ID from the resolved product
            const variantId = toolUse.parameters?.lines?.[0]?.id;
            const quantity = toolUse.parameters?.lines?.[0]?.quantity || 1;
            
            if (!variantId) {
              throw new Error('No variant ID found for add to cart');
            }
            
            mcpData = await handleCartOperation('ADD_TO_CART', {
              variantId: variantId.replace('gid://shopify/ProductVariant/', ''),
              quantity
            });
          } else if (toolUse.name === 'remove_from_cart') {
            const lineIds = toolUse.parameters?.lineIds;
            
            if (!lineIds || lineIds.length === 0) {
              throw new Error('No line IDs found for remove from cart');
            }
            
            mcpData = await handleCartOperation('REMOVE_FROM_CART', {
              lineId: lineIds[0]
            });
          } else if (toolUse.name === 'get_cart') {
            mcpData = await handleCartOperation('GET_CART', {});
          }
          
          console.log('Cart operation result:', mcpData);
          
          // Update local state
          if (mcpData.cart) {
            setLastCart(mcpData.cart);
            
            // Simple notification for cart changes
            if (toolUse.name === 'add_to_cart' || toolUse.name === 'remove_from_cart') {
              notifyStorefrontCartChange(toolUse.name, mcpData.cart);
            }
          }
          
        } catch (error) {
          console.error('Cart operation failed:', error);
          setMessages((msgs) => [
            ...msgs,
            { from: 'assistant', message: `Sorry, there was an error with the cart operation: ${error instanceof Error ? error.message : String(error)}` },
          ]);
          setLoading(false);
          return;
        }
      }
      // Use MCP API for non-cart operations (product search, checkout)
      else {
        const mcpRes = await fetch('/api/mcp/customer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ tool_use: toolUse }),
        });
        mcpData = await mcpRes.json();
      }
      
      // Enhanced error handling for cart operations
      if (['add_to_cart', 'remove_from_cart', 'begin_checkout', 'get_cart'].includes(toolUse.name)) {
        console.log('=== CART OPERATION RESULT ===');
        console.log('Cart operation response:', mcpData);
        console.log('Has cart in response:', !!mcpData.cart);
        console.log('Has error in response:', !!mcpData.error);
        
        if (mcpData.error) {
          console.log('Cart operation returned error:', mcpData.error);
          
          // Show error message to user
          setMessages((msgs) => [
            ...msgs,
            { from: 'assistant', message: `Sorry, there was an error with the cart operation: ${mcpData.error}` },
          ]);
          setLoading(false);
          return;
        }
        
        if (!mcpData.cart && toolUse.name !== 'get_cart') {
          console.log('Cart operation did not return cart data');
          
          // Show error message to user
          setMessages((msgs) => [
            ...msgs,
            { from: 'assistant', message: 'Sorry, the cart operation did not complete successfully. Please try again.' },
          ]);
          setLoading(false);
          return;
        }
        
        console.log('=== END CART OPERATION RESULT ===');
      }
      
      console.log('Response from cart operation:', mcpData);

      // If this was a product search, update lastProducts with the backend result
      if (toolUse.name === 'query_products' && Array.isArray(mcpData.products)) {
        setLastProducts(mcpData.products);
        console.log('Updated lastProducts from backend:', mcpData.products);
      }
      // If this was a cart operation, update lastCart with the backend result
      if ((toolUse.name === 'get_cart' || toolUse.name === 'add_to_cart' || toolUse.name === 'remove_from_cart') && mcpData.cart) {
        setLastCart(mcpData.cart);
        console.log('Updated lastCart from backend:', mcpData.cart);
        
        // Fetch checkout URL for cart operations
        if (mcpData.cart.id) {
          fetchCheckoutUrl(mcpData.cart.id);
        }
        
        // Sync changes back to storefront for add/remove operations
        if (toolUse.name === 'add_to_cart' || toolUse.name === 'remove_from_cart') {
          console.log('=== SYNCING CART TO STOREFRONT ===');
          console.log('Cart operation:', toolUse.name);
          console.log('Cart ID:', mcpData.cart?.id);
          
          // Simple notification to parent window to refresh cart display
          notifyStorefrontCartChange(toolUse.name, mcpData.cart);
          
          console.log('=== CART SYNC COMPLETED ===');
        }
      }
      
      // Simplified get_cart fallback logic
      if (toolUse.name === 'get_cart') {
        console.log('=== GET_CART FALLBACK LOGIC ===');
        console.log('MCP Data received:', mcpData);
        console.log('Has cart in response:', !!mcpData.cart);
        
        // Strategy 1: If MCP returned cart, use it
        if (mcpData.cart) {
          console.log('Using MCP cart data');
          setLastCart(mcpData.cart);
        }
        // Strategy 2: If no MCP cart but we have cached lastCart, use it
        else if (lastCart) {
          console.log('Using cached lastCart data');
          mcpData = {
            cart: lastCart,
            action: 'get_cart',
            source: 'cache'
          };
        }
        // Strategy 3: If we have shopify cart data, create response from it
        else if (shopifyCart && shopifyCart.items && shopifyCart.items.length > 0) {
          console.log('Creating cart from Shopify data');
          
          const mockCartResponse = {
            id: shopifyCart.id || shopifyCart.token,
            lines: {
              edges: shopifyCart.items.map((item: any, index: number) => ({
                node: {
                  id: item.key || item.id || `line_${index}`,
                  quantity: item.quantity || 1,
                  merchandise: {
                    product: {
                      title: item.title || item.product_title || 'Unknown Product'
                    },
                    title: item.variant_title || item.title || '',
                    price: {
                      amount: item.price ? (item.price / 100).toString() : '0',
                      currencyCode: shopifyCart.currency || 'USD'
                    },
                    image: {
                      url: item.image || item.featured_image?.url || null,
                      altText: item.product_title || item.title || 'Product image'
                    }
                  }
                }
              }))
            },
            totalQuantity: shopifyCart.itemCount || shopifyCart.items.length,
            estimatedCost: {
              totalAmount: {
                amount: shopifyCart.totalPrice ? (shopifyCart.totalPrice / 100).toString() : '0',
                currencyCode: shopifyCart.currency || 'USD'
              }
            }
          };
          
          mcpData = {
            cart: mockCartResponse,
            action: 'get_cart',
            source: 'shopify_data'
          };
          setLastCart(mockCartResponse);
        }
        // Strategy 4: Create empty cart response
        else {
          console.log('Creating empty cart response');
          mcpData = {
            cart: {
              id: null,
              lines: { edges: [] },
              totalQuantity: 0,
              estimatedCost: {
                totalAmount: {
                  amount: '0',
                  currencyCode: 'USD'
                }
              }
            },
            action: 'get_cart',
            source: 'empty'
          };
        }
        
        console.log('Final get_cart response:', mcpData);
        console.log('=== END GET_CART FALLBACK LOGIC ===');
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
      // Show checkout suggestion if this was a get_cart tool call and cart has items
      if (toolUse.name === 'get_cart' && mcpData.cart && mcpData.cart.lines && mcpData.cart.lines.edges && mcpData.cart.lines.edges.length > 0) {
        setShowCheckoutSuggestion(true);
        // Fetch checkout URL for the cart
        fetchCheckoutUrl(mcpData.cart.id);
      } else {
        setShowCheckoutSuggestion(false);
        setCheckoutUrl(null);
      }
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

  // Simple function to notify storefront of cart changes
  function notifyStorefrontCartChange(action: string, cart: any) {
    try {
      if (window.parent && window.parent !== window) {
        const message = {
          type: 'CART_UPDATED',
          source: 'plugin',
          action: action,
          cartId: cart?.id,
          itemCount: cart?.totalQuantity || 0,
          timestamp: Date.now()
        };
        
        console.log('Notifying storefront of cart change:', message);
        window.parent.postMessage(message, '*');
      }
    } catch (error) {
      console.log('Error notifying storefront of cart change:', error);
    }
  }

  // Simplified cart sync - just update welcome message if needed
  async function handleCartSync(cartData: any, cartToken: string | null, customerData: any, sessionToken: string | null) {
    try {
      console.log('=== SIMPLE CART SYNC ===');
      console.log('Customer data:', customerData);
      console.log('Cart data:', cartData);
      
      // Update welcome message for logged-in customer
      if (customerData && customerData.isLoggedIn && customerData.firstName) {
        setMessages(prev => {
          if (prev.length === 1 && prev[0].message.includes('How can I help you today?')) {
            return [{
              from: 'assistant',
              message: `Hi ${customerData.firstName}! I am your shop assistant. I can help you find products, manage your cart, and answer questions. How can I help you today?`
            }];
          }
          return prev;
        });
      }
      
      // If cart has items, update welcome message
      if (cartData && cartData.items && cartData.items.length > 0) {
        const itemCount = cartData.items.length;
        const welcomeMessage = customerData?.firstName 
          ? `Hi ${customerData.firstName}! I see you have ${itemCount} item${itemCount > 1 ? 's' : ''} in your cart. How can I help you today?`
          : `I see you have ${itemCount} item${itemCount > 1 ? 's' : ''} in your cart. How can I help you today?`;
        
        setMessages(prev => {
          if (prev.length === 1 && prev[0].message.includes('How can I help you today?')) {
            return [{
              from: 'assistant',
              message: welcomeMessage
            }];
          }
          return prev;
        });
      }
      
      console.log('=== CART SYNC COMPLETED ===');
      
    } catch (error) {
      console.log('Cart sync error:', error);
    }
  }

  // Update welcome message based on cart and customer data
  // Simplified cart sync - no periodic sync needed since cart is managed in storefront
  useEffect(() => {
    // Listen for storage changes to sync cart across tabs
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'shop-assistant-cart-id' && event.newValue) {
        console.log('Cart ID changed in another tab, will refresh on next operation');
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);


  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: 24,background: '#ffffff' }}>
      <h1>Shop Assistant Chat</h1>
      {shopifyCustomer?.isLoggedIn ? (
        <div style={{ marginBottom: 16, padding: 12, background: '#f0f9ff', borderRadius: 8, border: '1px solid #0ea5e9' }}>
          <span style={{ color: '#0ea5e9', fontWeight: 600 }}>
            Welcome back, {shopifyCustomer.firstName || shopifyCustomer.email}! 
          </span>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Logged in via Shopify Store
          </div>
        </div>
      ) : customerToken ? (
        <div style={{ marginBottom: 16 }}>
          <span>Logged in as customer</span>
          <button
            onClick={() => setCustomerToken(null)}
            style={{
              marginLeft: 8,
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 12,
              border: '1px solid #e11d48',
              background: '#fff',
              color: '#e11d48',
              fontWeight: 600,
              transition: 'background 0.2s, color 0.2s, border 0.2s',
            }}
            onMouseOver={e => {
              e.currentTarget.style.background = '#e11d48';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseOut={e => {
              e.currentTarget.style.background = '#fff';
              e.currentTarget.style.color = '#e11d48';
            }}
          >
            Logout
          </button>
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
              borderRadius: 6,
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
      {showLogin && !customerToken && !shopifyCustomer?.isLoggedIn && (
        <form onSubmit={handleCustomerLogin} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="email"
              value={customerEmail}
              onChange={e => setCustomerEmail(e.target.value)}
              placeholder="Customer Email"
              required
              style={{ width: 180, padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: 12 }}
            />
            <input
              type="password"
              value={customerPassword}
              onChange={e => setCustomerPassword(e.target.value)}
              placeholder="Password"
              required
              style={{ width: 150, padding: 6, borderRadius: 6, border: '1px solid #ccc', fontSize: 12 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                background: 'linear-gradient(90deg, #6366f1 0%, #60a5fa 100%)',
                color: '#fff',
                border: 'none',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.10)',
                transition: 'background 0.2s, box-shadow 0.2s',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'linear-gradient(90deg, #4f46e5 0%, #2563eb 100%)')}
              onMouseOut={e => (e.currentTarget.style.background = 'linear-gradient(90deg, #6366f1 0%, #60a5fa 100%)')}
            >
              Login with Shopify
            </button>
            <button
              type="button"
              onClick={() => setShowLogin(false)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                background: '#fff',
                color: '#6366f1',
                border: '1px solid #6366f1',
                transition: 'background 0.2s, color 0.2s, border 0.2s',
              }}
              onMouseOver={e => {
                e.currentTarget.style.background = '#6366f1';
                e.currentTarget.style.color = '#fff';
                e.currentTarget.style.border = '1px solid #6366f1';
              }}
              onMouseOut={e => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.color = '#6366f1';
                e.currentTarget.style.border = '1px solid #6366f1';
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {loginSent && <div style={{ color: 'green', marginBottom: 8 }}>Opening Shopify login page...</div>}
      {loginError && <div style={{ color: 'red', marginBottom: 8 }}>{loginError}</div>}
      <div style={{ minHeight: 300, marginBottom: 16 }}>
        {messages.map((msg, i) => (
          <ChatBubble key={i} message={msg.message} from={msg.from as any} />
        ))}
        {loading && <ChatBubble message="Thinking..." from="assistant" />}
        {/* Proceed to checkout suggestion button */}
        {showCheckoutSuggestion && !loading && (
          <div style={{ textAlign: 'left', marginTop: 8 }}>
            {checkoutUrl ? (
              <a
                href={checkoutUrl}
                target="_top"
                style={{
                  background: 'linear-gradient(90deg, #d2d2e9 0%, #bdcbdc 100%)',
                  color: '#000',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontWeight: 400,
                  fontSize: 14,
                  boxShadow: '0 2px 8px rgba(99, 102, 241, 0.10)',
                  cursor: 'pointer',
                  transition: 'background 0.2s, box-shadow 0.2s',
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'linear-gradient(90deg, #908cd6 0%, #7290d1 100%)')}
                onMouseOut={e => (e.currentTarget.style.background = 'linear-gradient(90deg, #dfdfec 0%, #cbd6e3 100%)')}
              >
                Proceed to checkout
              </a>
            ) : (
              <button
                onClick={(e) => handleSend(e, 'begin checkout')}
                style={{
                  background: 'linear-gradient(90deg, #d2d2e9 0%, #bdcbdc 100%)',
                  color: '#000',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontWeight: 400,
                  fontSize: 14,
                  boxShadow: '0 2px 8px rgba(99, 102, 241, 0.10)',
                  cursor: 'pointer',
                  transition: 'background 0.2s, box-shadow 0.2s',
                }}
                onMouseOver={e => (e.currentTarget.style.background = 'linear-gradient(90deg, #908cd6 0%, #7290d1 100%)')}
                onMouseOut={e => (e.currentTarget.style.background = 'linear-gradient(90deg, #dfdfec 0%, #cbd6e3 100%)')}
              >
                Proceed to checkout
              </button>
            )}
          </div>
        )}
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
        <button type="submit" disabled={loading || !input.trim()} style={{ padding: '8px 16px', borderRadius: 8,cursor: 'pointer' }}>
          Send
        </button>
      </form>
    </div>
  );
}
