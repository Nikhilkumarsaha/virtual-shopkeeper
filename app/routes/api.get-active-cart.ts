import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';

export const action: ActionFunction = async ({ request }) => {
  try {
    const { customerAccessToken, cartId } = await request.json();

    const shop = process.env.SHOPIFY_SHOP_DOMAIN;
    const storefrontToken = process.env.SHOPIFY_STOREFRONT_API_TOKEN;
    if (!shop || !storefrontToken) {
      return json({ cartId: null, error: 'Shopify configuration missing' });
    }
    const endpoint = `https://${shop}/api/2023-10/graphql.json`;

    // If cartId is provided, try to fetch the cart
    if (cartId) {
      console.log('Attempting to fetch cart with ID:', cartId);
      
      // Ensure cartId is in the correct Global ID format for Storefront API
      let formattedCartId = cartId;
      if (!cartId.startsWith('gid://shopify/Cart/')) {
        // If it's a numeric ID or token, convert to Global ID format
        formattedCartId = `gid://shopify/Cart/${cartId}`;
      }
      
      console.log('Using formatted cart ID:', formattedCartId);
      
      const query = `query getCart($id: ID!) {\n  cart(id: $id) { id checkoutUrl totalQuantity }\n}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': storefrontToken,
          ...(customerAccessToken ? { 'Shopify-Storefront-Buyer-Token': customerAccessToken } : {}),
        },
        body: JSON.stringify({ query, variables: { id: formattedCartId } }),
      });
      const data = await res.json();
      
      console.log('Cart fetch response:', data);
      
      if (data.data?.cart?.id) {
        return json({ cartId: data.data.cart.id });
      }
      
      // If cart fetch failed, log the error for debugging
      if (data.errors) {
        console.log('Cart fetch errors:', data.errors);
      }
      
      // If cart is not found or invalid, fall through to create a new cart
    }

    // Create a new cart for the customer
    const mutation = `mutation cartCreate($input: CartInput!) {\n  cartCreate(input: $input) {\n    cart { id }\n    userErrors { message }\n  }\n}`;
    const variables = { input: {} };
    const cartRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken,
        ...(customerAccessToken ? { 'Shopify-Storefront-Buyer-Token': customerAccessToken } : {}),
      },
      body: JSON.stringify({ query: mutation, variables }),
    });
    const cartData = await cartRes.json();
    const newCartId = cartData.data?.cartCreate?.cart?.id || null;
    if (newCartId) {
      return json({ cartId: newCartId });
    } else {
      return json({ cartId: null, error: cartData.data?.cartCreate?.userErrors?.[0]?.message || 'Failed to create cart' });
    }
  } catch (err) {
    return json({ cartId: null, error: String(err) });
  }
};
