import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';

// Supported tool actions for customers
const TOOL_ACTIONS = [
  'query_products',
  'create_cart',
  'add_to_cart',
  'remove_from_cart',
  'begin_checkout',
  'order_status',
  'get_cart',
];


// Helper function to make Storefront API calls
async function storefrontApiCall(query: string, variables: any = {}, customerAccessToken?: string) {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!shop || !accessToken) {
    throw new Error('Missing Shopify storefront configuration');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': accessToken,
  };
  if (customerAccessToken) {
    headers['Shopify-Storefront-Buyer-Token'] = customerAccessToken;
  }

  const response = await fetch(`https://${shop}/api/2024-01/graphql.json`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`Storefront API error: ${response.status}`);
  }

  return response.json();
}

// Customer-facing MCP endpoint that doesn't require admin authentication
export const action: ActionFunction = async ({ request }) => {
  try {
    const body = await request.json();
    const { tool_use } = body;

    if (!tool_use || !tool_use.name) {
      return json({ error: 'Missing tool_use or tool_use.name' }, { status: 400 });
    }

    const { name, parameters } = tool_use;
    if (!TOOL_ACTIONS.includes(name)) {
      return json({ error: `Unknown tool_use: ${name}` }, { status: 400 });
    }

    // Get customer access token from header
    const customerAccessToken = request.headers.get('x-customer-access-token') || undefined;

    switch (name) {
      case 'query_products': {
        const query = parameters?.query || '';

        const gql = `#graphql
          query searchProducts($query: String!, $first: Int!) {
            products(query: $query, first: $first) {
              edges {
                node {
                  id
                  title
                  handle
                  description
                  images(first: 1) {
                    edges {
                      node {
                        url
                        altText
                      }
                    }
                  }
                  variants(first: 10) {
                    edges {
                      node {
                        id
                        title
                        price {
                          amount
                          currencyCode
                        }
                        availableForSale
                      }
                    }
                  }
                }
              }
            }
          }`;

        const data = await storefrontApiCall(gql, { query, first: 10 }, customerAccessToken);

        return json({
          products: data.data.products.edges.map((edge: any) => edge.node),
          action: 'query_products',
          query
        });
      }

      case 'create_cart': {
        const lines = parameters?.lines || [];

        const gql = `#graphql
          mutation cartCreate($input: CartInput!) {
            cartCreate(input: $input) {
              cart {
                id
                checkoutUrl
                totalQuantity
                lines(first: 10) {
                  edges {
                    node {
                      id
                      quantity
                      merchandise {
                        ... on ProductVariant {
                          id
                          title
                          price {
                            amount
                            currencyCode
                          }
                          product {
                            title
                            handle
                          }
                        }
                      }
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }`;

        const input = {
          lines: lines.map((line: any) => ({
            merchandiseId: line.variantId,
            quantity: line.quantity
          }))
        };

        const data = await storefrontApiCall(gql, { input }, customerAccessToken);

        if (data.data.cartCreate.userErrors.length > 0) {
          return json({
            error: data.data.cartCreate.userErrors[0].message,
            action: 'create_cart'
          });
        }

        return json({
          cart: data.data.cartCreate.cart,
          action: 'create_cart'
        });
      }

      case 'add_to_cart': {
        const { cartId, lines } = parameters || {};

        if (!cartId) {
          // Create new cart if no cartId provided
          return json({
            error: 'Cart ID required for adding items',
            action: 'add_to_cart'
          });
        }

        const gql = `#graphql
          mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
            cartLinesAdd(cartId: $cartId, lines: $lines) {
              cart {
                id
                checkoutUrl
                totalQuantity
                lines(first: 10) {
                  edges {
                    node {
                      id
                      quantity
                      merchandise {
                        ... on ProductVariant {
                          id
                          title
                          price {
                            amount
                            currencyCode
                          }
                          product {
                            title
                            handle
                          }
                        }
                      }
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }`;

        const cartLines = lines.map((line: any) => ({
          merchandiseId: line.variantId,
          quantity: line.quantity
        }));

        const data = await storefrontApiCall(gql, { cartId, lines: cartLines }, customerAccessToken);

        if (data.data.cartLinesAdd.userErrors.length > 0) {
          return json({
            error: data.data.cartLinesAdd.userErrors[0].message,
            action: 'add_to_cart'
          });
        }

        return json({
          cart: data.data.cartLinesAdd.cart,
          action: 'add_to_cart'
        });
      }

      case 'remove_from_cart': {
        const { cartId, lineIds } = parameters || {};

        if (!cartId || !lineIds) {
          return json({
            error: 'Cart ID and line IDs required',
            action: 'remove_from_cart'
          });
        }

        const gql = `#graphql
          mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
            cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
              cart {
                id
                checkoutUrl
                totalQuantity
                lines(first: 10) {
                  edges {
                    node {
                      id
                      quantity
                      merchandise {
                        ... on ProductVariant {
                          id
                          title
                          price {
                            amount
                            currencyCode
                          }
                          product {
                            title
                            handle
                          }
                        }
                      }
                    }
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }`;

        const data = await storefrontApiCall(gql, { cartId, lineIds }, customerAccessToken);

        if (data.data.cartLinesRemove.userErrors.length > 0) {
          return json({
            error: data.data.cartLinesRemove.userErrors[0].message,
            action: 'remove_from_cart'
          });
        }

        return json({
          cart: data.data.cartLinesRemove.cart,
          action: 'remove_from_cart'
        });
      }

      case 'begin_checkout': {
        const { cartId } = parameters || {};

        if (!cartId) {
          return json({
            error: 'Cart ID required for checkout',
            action: 'begin_checkout'
          });
        }

        // Get cart checkout URL
        const gql = `#graphql
          query getCart($cartId: ID!) {
            cart(id: $cartId) {
              id
              checkoutUrl
              totalQuantity
            }
          }`;

        const data = await storefrontApiCall(gql, { cartId }, customerAccessToken);

        if (!data.data.cart) {
          return json({
            error: 'Cart not found',
            action: 'begin_checkout'
          });
        }

        return json({
          checkoutUrl: data.data.cart.checkoutUrl,
          action: 'begin_checkout'
        });
      }

      case 'order_status': {
        const { orderId } = parameters || {};

        if (!orderId) {
          return json({
            error: 'Order ID required',
            action: 'order_status'
          });
        }

        // Note: Order status requires customer access token
        // For now, return a placeholder response
        return json({
          order: {
            id: orderId,
            status: 'processing',
            message: 'Order status requires customer authentication'
          },
          action: 'order_status'
        });
      }

      case 'get_cart': {
        const { cartId } = parameters || {};
        if (!cartId) {
          return json({ error: 'Cart ID required for get_cart', action: 'get_cart' });
        }
        const gql = `#graphql\n          query getCart($id: ID!) {\n            cart(id: $id) {\n              id\n              checkoutUrl\n              totalQuantity\n              lines(first: 20) {\n                edges {\n                  node {\n                    id\n                    quantity\n                    merchandise {\n                      ... on ProductVariant {\n                        id\n                        title\n                        price {\n                          amount\n                          currencyCode\n                        }\n                        product {\n                          title\n                          handle\n                        }\n                      }\n                    }\n                  }\n                }\n              }\n            }\n          }`;
        const data = await storefrontApiCall(gql, { id: cartId }, customerAccessToken);
        return json({
          cart: data.data.cart,
          action: 'get_cart'
        });
      }

      default:
        return json({ error: 'Not implemented' }, { status: 501 });
    }
  } catch (err) {
    console.error('Customer MCP endpoint error:', err);
    const message = (err instanceof Error && err.message) ? err.message : String(err);
    return json({ error: 'Internal server error', details: message }, { status: 500 });
  }
};
