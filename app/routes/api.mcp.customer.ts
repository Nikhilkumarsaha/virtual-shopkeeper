import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';

// Supported tool actions for customers
const TOOL_ACTIONS = [
  'query_products',
  'begin_checkout',
  'order_status',
];


// Helper function to make Storefront API calls (no customer auth needed for basic queries)
async function storefrontApiCall(query: string, variables: any = {}) {
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;

  if (!shop || !accessToken) {
    throw new Error('Missing Shopify storefront configuration');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Shopify-Storefront-Access-Token': accessToken,
  };

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

  const result = await response.json();
  
  // Check for GraphQL errors
  if (result.errors && result.errors.length > 0) {
    console.error('GraphQL errors:', result.errors);
    throw new Error(`GraphQL error: ${result.errors[0].message}`);
  }

  return result;
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

    // Get customer access token from header (not needed for basic queries)
    // const customerAccessToken = request.headers.get('x-customer-access-token') || undefined;

    switch (name) {
      case 'query_products': {
        const query = parameters?.query || '';

        const gql = `
          query searchProducts($query: String!, $first: Int!) {
            products(query: $query, first: $first) {
              edges {
                node {
                  id
                  title
                  handle
                  description
                  media(first: 1) {
                    edges {
                      node {
                        ... on MediaImage {
                          image {
                            url
                            altText
                          }
                        }
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

        const data = await storefrontApiCall(gql, { query, first: 10 });

        // Ensure we have a valid response structure
        if (!data?.data?.products?.edges) {
          return json({
            error: 'No products found or invalid response structure',
            action: 'query_products',
            query
          });
        }

        return json({
          products: data.data.products.edges.map((edge: any) => edge.node),
          action: 'query_products',
          query
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

        // Simple checkout URL generation - no need for complex auth
        // In a real storefront, this would redirect to the checkout page
        const checkoutUrl = `${process.env.SHOPIFY_SHOP_DOMAIN ? `https://${process.env.SHOPIFY_SHOP_DOMAIN}` : ''}/cart`;

        return json({
          checkoutUrl,
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

      default:
        return json({ error: 'Not implemented' }, { status: 501 });
    }
  } catch (err) {
    console.error('Customer MCP endpoint error:', err);
    const message = (err instanceof Error && err.message) ? err.message : String(err);
    return json({ error: 'Internal server error', details: message }, { status: 500 });
  }
};
