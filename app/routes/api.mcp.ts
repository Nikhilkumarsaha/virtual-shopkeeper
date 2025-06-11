import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';
import { authenticate } from '../shopify.server';

// Supported tool actions
const TOOL_ACTIONS = [
  'query_products',
  'create_cart',
  'add_to_cart',
  'remove_from_cart',
  'begin_checkout',
  'order_status',
];

// This is the MCP-compatible webhook endpoint that Claude will call
export const action: ActionFunction = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const body = await request.json();
    const { tool_use } = body;
    if (!tool_use || !tool_use.name) {
      return json({ error: 'Missing tool_use or tool_use.name' }, { status: 400 });
    }
    const { name, parameters } = tool_use;
    if (!TOOL_ACTIONS.includes(name)) {
      return json({ error: `Unknown tool_use: ${name}` }, { status: 400 });
    }

    // Route to the appropriate Shopify API logic
    switch (name) {
      case 'query_products': {
        // Example: search products by title substring
        const query = parameters?.query || '';
        const gql = `#graphql\n{
          products(first: 10, query: $query) {
            edges {
              node {
                id
                title
                handle
                description
                images(first: 1) { edges { node { url } } }
                variants(first: 1) { edges { node { id price } } }
              }
            }
          }
        }`;
        const response = await admin.graphql(gql, { variables: { query } });
        const data = await response.json();
        return json({ products: data.data.products.edges.map((e: { node: any }) => e.node) });
      }
      case 'create_cart': {
        // Example: create a cart with optional initial line items
        const lines = parameters?.lines || [];
        const gql = `#graphql\nmutation createCart($lines: [CartLineInput!]) {
          cartCreate(input: { lines: $lines }) {
            cart { id checkoutUrl lines(first: 10) { edges { node { id quantity merchandise { ... on ProductVariant { id title price } } } } } }
            userErrors { field message }
          }
        }`;
        const response = await admin.graphql(gql, { variables: { lines } });
        const data = await response.json();
        return json({ cart: data.data.cartCreate.cart, errors: data.data.cartCreate.userErrors });
      }
      case 'add_to_cart': {
        // Example: add line items to an existing cart
        const { cartId, lines } = parameters || {};
        if (!cartId || !lines) return json({ error: 'Missing cartId or lines' }, { status: 400 });
        const gql = `#graphql\nmutation addLines($cartId: ID!, $lines: [CartLineInput!]!) {
          cartLinesAdd(cartId: $cartId, lines: $lines) {
            cart { id checkoutUrl lines(first: 10) { edges { node { id quantity merchandise { ... on ProductVariant { id title price } } } } } }
            userErrors { field message }
          }
        }`;
        const response = await admin.graphql(gql, { variables: { cartId, lines } });
        const data = await response.json();
        return json({ cart: data.data.cartLinesAdd.cart, errors: data.data.cartLinesAdd.userErrors });
      }
      case 'remove_from_cart': {
        // Example: remove line items from a cart
        const { cartId, lineIds } = parameters || {};
        if (!cartId || !lineIds) return json({ error: 'Missing cartId or lineIds' }, { status: 400 });
        const gql = `#graphql\nmutation removeLines($cartId: ID!, $lineIds: [ID!]!) {
          cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
            cart { id checkoutUrl lines(first: 10) { edges { node { id quantity merchandise { ... on ProductVariant { id title price } } } } } }
            userErrors { field message }
          }
        }`;
        const response = await admin.graphql(gql, { variables: { cartId, lineIds } });
        const data = await response.json();
        return json({ cart: data.data.cartLinesRemove.cart, errors: data.data.cartLinesRemove.userErrors });
      }
      case 'begin_checkout': {
        // Example: return checkout URL for a cart
        const { cartId } = parameters || {};
        if (!cartId) return json({ error: 'Missing cartId' }, { status: 400 });
        // In Shopify, checkout is handled via the cart's checkoutUrl
        // Optionally, you could trigger additional logic here
        return json({ checkoutUrl: `https://yourshop.myshopify.com/cart/${cartId}` });
      }
      case 'order_status': {
        // Example: fetch order status by order ID
        const { orderId } = parameters || {};
        if (!orderId) return json({ error: 'Missing orderId' }, { status: 400 });
        const gql = `#graphql\nquery getOrder($id: ID!) {
          order(id: $id) {
            id name statusUrl fulfillmentStatus financialStatus createdAt totalPriceSet { shopMoney { amount currencyCode } }
          }
        }`;
        const response = await admin.graphql(gql, { variables: { id: orderId } });
        const data = await response.json();
        return json({ order: data.data.order });
      }
      default:
        return json({ error: 'Not implemented' }, { status: 501 });
    }
  } catch (err) {
    console.error('MCP endpoint error:', err);
    const message = (err instanceof Error && err.message) ? err.message : String(err);
    return json({ error: 'Internal server error', details: message }, { status: 500 });
  }
};
