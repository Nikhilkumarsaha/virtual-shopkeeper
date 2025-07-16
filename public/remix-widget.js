(function () {
  // Wait for DOM to be ready and check for customer data
  function initWidget() {  
    // Function to get fresh customer data
    function getFreshCustomerData() {
      // First try to get customer data from Shopify Liquid
      let customerData = window.CHATBOT_CUSTOMER || {
        isLoggedIn: false,
        id: null,
        email: null,
        firstName: null,
        lastName: null,
        name: null
      };
      
      // If no customer data from Liquid, try to detect from DOM/cookies
      if (!customerData.isLoggedIn) {
        // Try multiple methods to detect customer login status
        customerData = detectCustomerFromDOM() || detectCustomerFromCookies() || customerData;
      }
      
      return customerData;
    }
    
    // Function to detect customer from DOM elements
    function detectCustomerFromDOM() {
      try {
        // Check for customer data in page content
        const customerElement = document.querySelector('[data-customer-id]');
        if (customerElement) {
          return {
            isLoggedIn: true,
            id: customerElement.dataset.customerId,
            email: customerElement.dataset.customerEmail || null,
            firstName: customerElement.dataset.customerFirstName || null,
            lastName: customerElement.dataset.customerLastName || null,
            name: customerElement.dataset.customerName || null
          };
        }
        
        // Check for customer info in meta tags
        const customerMeta = document.querySelector('meta[name="customer-id"]');
        if (customerMeta) {
          return {
            isLoggedIn: true,
            id: customerMeta.content,
            email: document.querySelector('meta[name="customer-email"]')?.content || null,
            firstName: document.querySelector('meta[name="customer-first-name"]')?.content || null,
            lastName: document.querySelector('meta[name="customer-last-name"]')?.content || null,
            name: document.querySelector('meta[name="customer-name"]')?.content || null
          };
        }
        
        // Check for customer info in global variables
        if (window.customer && window.customer.id) {
          return {
            isLoggedIn: true,
            id: window.customer.id,
            email: window.customer.email || null,
            firstName: window.customer.first_name || null,
            lastName: window.customer.last_name || null,
            name: window.customer.name || null
          };
        }
        
        // Check if logout link exists (indicates user is logged in)
        const logoutLink = document.querySelector('a[href*="/account/logout"], a[href*="/customer/logout"]');
        if (logoutLink) {
          return {
            isLoggedIn: true,
            id: null,
            email: null,
            firstName: null,
            lastName: null,
            name: null
          };
        }
        
        return null;
      } catch (error) {
        console.log('Error detecting customer from DOM:', error);
        return null;
      }
    }
    
    // Function to detect customer from cookies
    function detectCustomerFromCookies() {
      try {
        // Check for common Shopify customer cookies
        const cookies = document.cookie.split(';');
        const customerCookie = cookies.find(cookie => 
          cookie.trim().startsWith('customer_id=') || 
          cookie.trim().startsWith('customer_email=') ||
          cookie.trim().startsWith('_shopify_customer_id=')
        );
        
        if (customerCookie) {
          return {
            isLoggedIn: true,
            id: null,
            email: null,
            firstName: null,
            lastName: null,
            name: null
          };
        }
        
        return null;
      } catch (error) {
        console.log('Error detecting customer from cookies:', error);
        return null;
      }
    }
    
    // Function to get fresh cart data
    function getFreshCartData() {
      return window.CHATBOT_CART || {
        id: null,
        token: null,
        itemCount: 0,
        totalPrice: 0,
        currency: 'USD',
        items: []
      };
    }
    
    // Initial data
    let customerData = getFreshCustomerData();
    let cartData = getFreshCartData();
    let cartToken = window.CHATBOT_CART_TOKEN || cartData.token;
    
    // Create the chat bubble
  const bubble = document.createElement('div');
  bubble.id = 'remix-chat-bubble';
  bubble.style.position = 'fixed';
  bubble.style.bottom = '24px';
  bubble.style.right = '24px';
  bubble.style.width = '60px';
  bubble.style.height = '60px';
  bubble.style.background = '#008060';
  bubble.style.borderRadius = '50%';
  bubble.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  bubble.style.display = 'flex';
  bubble.style.alignItems = 'center';
  bubble.style.justifyContent = 'center';
  bubble.style.cursor = 'pointer';
  bubble.style.zIndex = '9999';
  bubble.innerHTML = '<span style="color:white;font-size:2rem;">💬</span>';

  // Create the modal/iframe
  const modal = document.createElement('div');
  modal.id = 'remix-chat-modal';
  modal.style.position = 'fixed';
  modal.style.bottom = '100px';
  modal.style.right = '24px';
  modal.style.width = '400px';
  modal.style.height = '600px';
  modal.style.background = 'white';
  modal.style.borderRadius = '16px';
  modal.style.boxShadow = '0 4px 24px rgba(0,0,0,0.2)';
  modal.style.display = 'none';
  modal.style.flexDirection = 'column';
  modal.style.overflow = 'hidden';
  modal.style.zIndex = '10000';

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.innerText = '×';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '8px';
  closeBtn.style.right = '16px';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '2rem';
  closeBtn.style.cursor = 'pointer';
  closeBtn.onclick = () => { modal.style.display = 'none'; };

  // Iframe for the assistant
  const iframe = document.createElement('iframe');
  iframe.src = 'https://targets-simulations-administrative-randy.trycloudflare.com/assistant';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';

  // Listen for iframe load to send customer data
  iframe.onload = function() {
    console.log('=== IFRAME LOADED - SENDING DATA ===');
    
    // Refresh customer and cart data when iframe loads
    customerData = getFreshCustomerData();
    cartData = getFreshCartData();
    cartToken = window.CHATBOT_CART_TOKEN || cartData.token;

    // Prepare the message data
    const messageData = {
      type: 'SHOPIFY_CUSTOMER_DATA',
      customerData: customerData,
      cartData: cartData,
      cartToken: cartToken
    };

    // Send customer data, cart data, and cart token to the assistant iframe
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage(messageData, '*');
      console.log('Data sent to iframe via postMessage');
    } else {
      console.log('ERROR: iframe.contentWindow not available');
    }
  };

  modal.appendChild(closeBtn);
  modal.appendChild(iframe);

  // Show/hide modal on bubble click (toggle functionality)
  bubble.onclick = async () => { 
    console.log('=== BUBBLE CLICKED ===');
    
    // Toggle modal visibility
    if (modal.style.display === 'none' || modal.style.display === '') {
      console.log('Opening modal...');
      modal.style.display = 'flex';
      
      // Refresh customer and cart data when opening modal
      customerData = getFreshCustomerData();
      cartData = getFreshCartData();
      cartToken = window.CHATBOT_CART_TOKEN || cartData.token;
      
      // Get fresh cart data from Shopify's Ajax API
      const freshCartData = await getCurrentCartData();
      console.log('Fresh cart data from Ajax API:', freshCartData);
      
      // Update local cart data with fresh data
      if (freshCartData) {
        Object.assign(cartData, {
          id: freshCartData.id,
          itemCount: freshCartData.totalQuantity,
          totalPrice: parseFloat(freshCartData.estimatedCost.totalAmount.amount) * 100,
          currency: freshCartData.estimatedCost.totalAmount.currencyCode,
          items: freshCartData.lines.edges.map(edge => ({
            id: edge.node.id,
            title: edge.node.merchandise.product.title,
            variant_title: edge.node.merchandise.title,
            quantity: edge.node.quantity,
            price: parseFloat(edge.node.merchandise.price.amount) * 100,
            image: edge.node.merchandise.image?.url || null
          }))
        });
      }
      
      // Send customer data, cart data, and cart token when modal is opened
      setTimeout(() => {
        console.log('=== SENDING DATA ON MODAL OPEN ===');
        
        const messageData = {
          type: 'SHOPIFY_CUSTOMER_DATA',
          customerData: customerData,
          cartData: cartData,
          cartToken: cartToken
        };
        
        console.log('Message data to send on modal open:', JSON.stringify(messageData, null, 2));
        
        if (iframe.contentWindow) {
          iframe.contentWindow.postMessage(messageData, '*');
          console.log('Data sent to iframe on modal open');
        } else {
          console.log('ERROR: iframe.contentWindow not available on modal open');
        }
      }, 100);
    } else {
      console.log('Closing modal...');
      modal.style.display = 'none';
    }
  };

  // Add to page
  document.body.appendChild(bubble);
  document.body.appendChild(modal);
  
  // Listen for cart updates from the plugin
  window.addEventListener('message', function(event) {
    console.log('Widget received message:', event.data);
    
    // Handle different types of messages from the plugin
    if (event.data.source === 'plugin') {
      switch(event.data.type) {
        case 'GET_CART':
          // Plugin is requesting current cart data
          handleGetCartRequest(event);
          break;
        case 'ADD_TO_CART':
          // Plugin wants to add item to cart
          handleAddToCart(event.data);
          break;
        case 'REMOVE_FROM_CART':
          // Plugin wants to remove item from cart
          handleRemoveFromCart(event.data);
          break;
        case 'UPDATE_CART':
          // Plugin wants to update cart item quantity
          handleUpdateCart(event.data);
          break;
        case 'CLEAR_CART':
          // Plugin wants to clear cart
          handleClearCart(event.data);
          break;
        default:
          console.log('Unknown message type from plugin:', event.data.type);
      }
    }
  });

  // Function to get current cart data using Shopify's Ajax API
  async function getCurrentCartData() {
    try {
      const response = await fetch('/cart.js');
      const cartData = await response.json();
      console.log('Current cart data from Ajax API:', cartData);
      
      // Transform to match expected format
      const transformedCart = {
        id: `gid://shopify/Cart/${cartData.token}`, // Use proper Shopify GraphQL Global ID format
        lines: {
          edges: cartData.items.map((item, index) => ({
            node: {
              id: item.key ? `gid://shopify/CartLine/${item.key}` : `gid://shopify/CartLine/line_${index}`,
              quantity: item.quantity,
              merchandise: {
                product: {
                  title: item.product_title
                },
                title: item.variant_title || item.title,
                price: {
                  amount: (item.price / 100).toString(),
                  currencyCode: cartData.currency
                },
                image: {
                  url: item.image || item.featured_image?.url || null,
                  altText: item.product_title || 'Product image'
                }
              }
            }
          }))
        },
        totalQuantity: cartData.item_count,
        estimatedCost: {
          totalAmount: {
            amount: (cartData.total_price / 100).toString(),
            currencyCode: cartData.currency
          }
        }
      };
      
      return transformedCart;
    } catch (error) {
      console.error('Failed to get cart data:', error);
      return null;
    }
  }

  // Handle get cart request from plugin
  async function handleGetCartRequest(event) {
    console.log('Handling get cart request from plugin');
    const cartData = await getCurrentCartData();
    
    // Send cart data back to plugin
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'CART_DATA_RESPONSE',
        source: 'theme',
        requestId: event.data.requestId,
        cart: cartData,
        success: !!cartData
      }, '*');
    }
  }

  // Handle add to cart request from plugin
  async function handleAddToCart(data) {
    console.log('Handling add to cart request:', data);
    
    try {
      const response = await fetch('/cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: data.variantId,
          quantity: data.quantity || 1
        })
      });
      
      const result = await response.json();
      console.log('Add to cart result:', result);
      
      // Get updated cart data
      const updatedCart = await getCurrentCartData();
      
      // Send response back to plugin
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'ADD_TO_CART_RESPONSE',
          source: 'theme',
          requestId: data.requestId,
          success: response.ok,
          cart: updatedCart,
          error: response.ok ? null : result.description || 'Failed to add to cart'
        }, '*');
      }
      
      // Update local cart data
      if (response.ok && updatedCart) {
        Object.assign(cartData, {
          id: updatedCart.id,
          itemCount: updatedCart.totalQuantity,
          totalPrice: parseFloat(updatedCart.estimatedCost.totalAmount.amount) * 100,
          items: updatedCart.lines.edges.map(edge => ({
            id: edge.node.id,
            title: edge.node.merchandise.product.title,
            variant_title: edge.node.merchandise.title,
            quantity: edge.node.quantity,
            price: parseFloat(edge.node.merchandise.price.amount) * 100,
            image: edge.node.merchandise.image?.url || null
          }))
        });
        
      }
      
    } catch (error) {
      console.error('Add to cart error:', error);
      
      // Send error response back to plugin
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'ADD_TO_CART_RESPONSE',
          source: 'theme',
          requestId: data.requestId,
          success: false,
          error: error.message || 'Failed to add to cart'
        }, '*');
      }
    }
  }

  // Handle remove from cart request from plugin
  async function handleRemoveFromCart(data) {
    console.log('Handling remove from cart request:', data);
    
    try {
      const response = await fetch('/cart/change.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: data.lineId.replace('gid://shopify/CartLine/', ''), // Extract raw key from Global ID
          quantity: 0
        })
      });
      
      const result = await response.json();
      console.log('Remove from cart result:', result);
      
      // Get updated cart data
      const updatedCart = await getCurrentCartData();
      
      // Send response back to plugin
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'REMOVE_FROM_CART_RESPONSE',
          source: 'theme',
          requestId: data.requestId,
          success: response.ok,
          cart: updatedCart,
          error: response.ok ? null : result.description || 'Failed to remove from cart'
        }, '*');
      }
      
      // Update local cart data
      if (response.ok && updatedCart) {
        Object.assign(cartData, {
          id: updatedCart.id,
          itemCount: updatedCart.totalQuantity,
          totalPrice: parseFloat(updatedCart.estimatedCost.totalAmount.amount) * 100,
          items: updatedCart.lines.edges.map(edge => ({
            id: edge.node.id,
            title: edge.node.merchandise.product.title,
            variant_title: edge.node.merchandise.title,
            quantity: edge.node.quantity,
            price: parseFloat(edge.node.merchandise.price.amount) * 100,
            image: edge.node.merchandise.image?.url || null
          }))
        });
        
      }
      
    } catch (error) {
      console.error('Remove from cart error:', error);
      
      // Send error response back to plugin
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'REMOVE_FROM_CART_RESPONSE',
          source: 'theme',
          requestId: data.requestId,
          success: false,
          error: error.message || 'Failed to remove from cart'
        }, '*');
      }
    }
  }

  // Handle update cart request from plugin
  async function handleUpdateCart(data) {
    console.log('Handling update cart request:', data);
    
    try {
      const response = await fetch('/cart/change.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: data.lineId.replace('gid://shopify/CartLine/', ''), // Extract raw key from Global ID
          quantity: data.quantity
        })
      });
      
      const result = await response.json();
      console.log('Update cart result:', result);
      
      // Get updated cart data
      const updatedCart = await getCurrentCartData();
      
      // Send response back to plugin
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'UPDATE_CART_RESPONSE',
          source: 'theme',
          requestId: data.requestId,
          success: response.ok,
          cart: updatedCart,
          error: response.ok ? null : result.description || 'Failed to update cart'
        }, '*');
      }
      
      // Update local cart data
      if (response.ok && updatedCart) {
        Object.assign(cartData, {
          id: updatedCart.id,
          itemCount: updatedCart.totalQuantity,
          totalPrice: parseFloat(updatedCart.estimatedCost.totalAmount.amount) * 100,
          items: updatedCart.lines.edges.map(edge => ({
            id: edge.node.id,
            title: edge.node.merchandise.product.title,
            variant_title: edge.node.merchandise.title,
            quantity: edge.node.quantity,
            price: parseFloat(edge.node.merchandise.price.amount) * 100,
            image: edge.node.merchandise.image?.url || null
          }))
        });
        
      }
      
    } catch (error) {
      console.error('Update cart error:', error);
      
      // Send error response back to plugin
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'UPDATE_CART_RESPONSE',
          source: 'theme',
          requestId: data.requestId,
          success: false,
          error: error.message || 'Failed to update cart'
        }, '*');
      }
    }
  }

  // Handle clear cart request from plugin
  async function handleClearCart(data) {
    console.log('Handling clear cart request:', data);
    
    try {
      const response = await fetch('/cart/clear.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const result = await response.json();
      console.log('Clear cart result:', result);
      
      // Get updated cart data
      const updatedCart = await getCurrentCartData();
      
      // Send response back to plugin
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'CLEAR_CART_RESPONSE',
          source: 'theme',
          requestId: data.requestId,
          success: response.ok,
          cart: updatedCart,
          error: response.ok ? null : 'Failed to clear cart'
        }, '*');
      }
      
      // Update local cart data
      if (response.ok) {
        Object.assign(cartData, {
          id: null,
          itemCount: 0,
          totalPrice: 0,
          items: []
        });
        
      }
      
    } catch (error) {
      console.error('Clear cart error:', error);
      
      // Send error response back to plugin
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'CLEAR_CART_RESPONSE',
          source: 'theme',
          requestId: data.requestId,
          success: false,
          error: error.message || 'Failed to clear cart'
        }, '*');
      }
    }
  }
  
  // Periodically check for cart changes in the storefront
  setInterval(function() {
    if (window.fetch) {
      fetch('/cart.js')
        .then(response => response.json())
        .then(storeCart => {
          // Check if the cart has changed
          if (storeCart.item_count !== cartData.itemCount) {
            console.log('Store cart changed, updating plugin...');
            console.log('Store cart data:', storeCart);
            // Update local cart data
            Object.assign(cartData, {
              id: `gid://shopify/Cart/${storeCart.token}`, // Use proper Global ID format
              token: storeCart.token,
              itemCount: storeCart.item_count,
              totalPrice: storeCart.total_price,
              currency: storeCart.currency,
              items: storeCart.items
            });
            
            // Send updated cart data to plugin
            if (iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: 'SHOPIFY_CUSTOMER_DATA',
                customerData: customerData,
                cartData: cartData,
                cartToken: cartToken
              }, '*');
            }
          }
        })
        .catch(error => {
          console.log('Failed to check store cart:', error);
        });
    }
  }, 10000); // Check every 10 seconds
  }
  
  // Initialize the widget when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget);
  } else {
    initWidget();
  }
})();
