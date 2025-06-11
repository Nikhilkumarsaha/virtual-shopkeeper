import { json } from '@remix-run/node';
import type { LoaderFunction } from '@remix-run/node';

// Claude Tool Manifest endpoint
export const loader: LoaderFunction = async () => {
  // Updated manifest for Claude tool use
  return json({
    schema_version: 'v1',
    name_for_human: 'Shopify Store Assistant',
    name_for_model: 'shopify_store_assistant',
    description_for_human: 'Conversational assistant for Shopify stores. Search, browse, add to cart, and checkout via chat.',
    description_for_model: 'Enables conversational commerce on Shopify. Claude can call tools to query products, manage carts, and handle checkout.',
    tools: [
      {
        name: 'query_products',
        description: 'Search for products by title or keyword.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term for product title or description.' },
          },
          required: ['query'],
        },
      },
      {
        name: 'create_cart',
        description: 'Create a new cart with optional initial line items.',
        parameters: {
          type: 'object',
          properties: {
            lines: { type: 'array', description: 'Initial line items (variantId, quantity)', items: { type: 'object' } },
          },
        },
      },
      {
        name: 'add_to_cart',
        description: 'Add line items to an existing cart.',
        parameters: {
          type: 'object',
          properties: {
            cartId: { type: 'string', description: 'Cart ID' },
            lines: { type: 'array', description: 'Line items to add (variantId, quantity)', items: { type: 'object' } },
          },
          required: ['cartId', 'lines'],
        },
      },
      {
        name: 'remove_from_cart',
        description: 'Remove line items from a cart.',
        parameters: {
          type: 'object',
          properties: {
            cartId: { type: 'string', description: 'Cart ID' },
            lineIds: { type: 'array', description: 'IDs of cart lines to remove', items: { type: 'string' } },
          },
          required: ['cartId', 'lineIds'],
        },
      },
      {
        name: 'begin_checkout',
        description: 'Get the checkout URL for a cart.',
        parameters: {
          type: 'object',
          properties: {
            cartId: { type: 'string', description: 'Cart ID' },
          },
          required: ['cartId'],
        },
      },
      {
        name: 'order_status',
        description: 'Get the status of an order by order ID.',
        parameters: {
          type: 'object',
          properties: {
            orderId: { type: 'string', description: 'Order ID' },
          },
          required: ['orderId'],
        },
      },
    ],
    api: {
      type: 'openapi',
      url: '/api/mcp/openapi.json', // Placeholder, update if needed
    },
    auth: {
      type: 'none',
    },
    contact_email: 'support@example.com',
    legal_info_url: 'https://example.com/legal',
  });
};
