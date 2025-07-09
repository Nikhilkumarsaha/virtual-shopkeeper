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

// Helper function to extract customer info from request
function getCustomerInfo(request: Request) {
  // Extract customer info from headers or cookies
  const customerEmail = request.headers.get('x-customer-email');
  const customerId = request.headers.get('x-customer-id');
  const customerAccessToken = request.headers.get('x-customer-access-token');

  return {
    customerEmail,
    customerId,
    customerAccessToken,
  };
}

// This is the MCP-compatible webhook endpoint that Claude will call
export const action: ActionFunction = async ({ request }) => {
  try {
    // Use admin authentication - this will work for admin panel
    // For storefront usage, we need to handle the redirect differently
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

    // Get customer information from request
    const customerInfo = getCustomerInfo(request);

    // Route to the appropriate Shopify API logic
    switch (name) {
      case 'query_products': {
        // Use Storefront API for product queries (customer-facing)
        const query = parameters?.query || '';
        const gql = `#graphql
          query getProducts($query: String!) {
            products(first: 10, query: $query) {
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
                      }
                    }
                  }
                  variants(first: 1) {
                    edges {
                      node {
                        id
                        price
                      }
                    }
                  }
                }
              }
            }
          }`;
        const response = await admin.graphql(gql, { variables: { query } });
        const data = await response.json();
        return json({ products: data.data.products.edges.map((e: { node: any }) => e.node) });
      }
      case 'create_cart': {
        // Create a draft order for the customer
        const lines = parameters?.lines || [];
        const gql = `#graphql
          mutation draftOrderCreate($input: DraftOrderInput!) {
            draftOrderCreate(input: $input) {
              draftOrder {
                id
                name
                totalPrice
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                lineItems(first: 10) {
                  edges {
                    node {
                      id
                      quantity
                      variant {
                        id
                        title
                        price
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

        const input: any = {
          lineItems: lines.map((line: any) => ({
            variantId: line.variantId,
            quantity: line.quantity
          }))
        };

        // Add customer email if available
        if (customerInfo.customerEmail) {
          input.email = customerInfo.customerEmail;
        }

        const response = await admin.graphql(gql, {
          variables: { input }
        });
        const data = await response.json();
        return json({
          cart: {
            id: data.data.draftOrderCreate.draftOrder.id,
            lines: data.data.draftOrderCreate.draftOrder.lineItems.edges.map((e: any) => ({
              id: e.node.id,
              quantity: e.node.quantity,
              merchandise: e.node.variant
            }))
          },
          errors: data.data.draftOrderCreate.userErrors
        });
      }
      case 'add_to_cart': {
        // Add items to draft order
        const { cartId, lines } = parameters || {};
        if (!lines) return json({ error: 'Missing lines' }, { status: 400 });

        // If no cartId is provided, create a new draft order
        if (!cartId) {
          const createGql = `#graphql
            mutation draftOrderCreate($input: DraftOrderInput!) {
              draftOrderCreate(input: $input) {
                draftOrder {
                  id
                  name
                  totalPrice
                  totalPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  lineItems(first: 10) {
                    edges {
                      node {
                        id
                        quantity
                        variant {
                          id
                          title
                          price
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

          const input: any = {
            lineItems: lines.map((line: any) => ({
              variantId: line.variantId,
              quantity: line.quantity
            }))
          };

          // Add customer email if available
          if (customerInfo.customerEmail) {
            input.email = customerInfo.customerEmail;
          }

          const createResponse = await admin.graphql(createGql, {
            variables: { input }
          });
          const createData = await createResponse.json();
          return json({
            cart: {
              id: createData.data.draftOrderCreate.draftOrder.id,
              lines: createData.data.draftOrderCreate.draftOrder.lineItems.edges.map((e: any) => ({
                id: e.node.id,
                quantity: e.node.quantity,
                merchandise: e.node.variant
              }))
            },
            errors: createData.data.draftOrderCreate.userErrors
          });
        }

        // If cartId exists, update the existing draft order
        const updateGql = `#graphql
          mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
            draftOrderUpdate(id: $id, input: $input) {
              draftOrder {
                id
                name
                totalPrice
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                lineItems(first: 10) {
                  edges {
                    node {
                      id
                      quantity
                      variant {
                        id
                        title
                        price
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
        const updateResponse = await admin.graphql(updateGql, {
          variables: {
            id: cartId,
            input: {
              lineItems: lines.map((line: any) => ({
                variantId: line.variantId,
                quantity: line.quantity
              }))
            }
          }
        });
        const updateData = await updateResponse.json();
        return json({
          cart: {
            id: updateData.data.draftOrderUpdate.draftOrder.id,
            lines: updateData.data.draftOrderUpdate.draftOrder.lineItems.edges.map((e: any) => ({
              id: e.node.id,
              quantity: e.node.quantity,
              merchandise: e.node.variant
            }))
          },
          errors: updateData.data.draftOrderUpdate.userErrors
        });
      }
      case 'remove_from_cart': {
        // Remove items from draft order
        const { cartId, lineIds } = parameters || {};
        if (!cartId || !lineIds) return json({ error: 'Missing cartId or lineIds' }, { status: 400 });
        const gql = `#graphql
          mutation draftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
            draftOrderUpdate(id: $id, input: $input) {
              draftOrder {
                id
                name
                totalPrice
                totalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                lineItems(first: 10) {
                  edges {
                    node {
                      id
                      quantity
                      variant {
                        id
                        title
                        price
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
        const response = await admin.graphql(gql, {
          variables: {
            id: cartId,
            input: {
              lineItems: [] // Empty array to remove all items
            }
          }
        });
        const data = await response.json();
        return json({
          cart: {
            id: data.data.draftOrderUpdate.draftOrder.id,
            lines: data.data.draftOrderUpdate.draftOrder.lineItems.edges.map((e: any) => ({
              id: e.node.id,
              quantity: e.node.quantity,
              merchandise: e.node.variant
            }))
          },
          errors: data.data.draftOrderUpdate.userErrors
        });
      }
      case 'begin_checkout': {
        // Convert draft order to order and get checkout URL
        const { cartId } = parameters || {};
        if (!cartId) return json({ error: 'Missing cartId' }, { status: 400 });
        const gql = `#graphql
          mutation draftOrderComplete($id: ID!) {
            draftOrderComplete(id: $id) {
              draftOrder {
                id
                order {
                  id
                  name
                  statusPageUrl
                }
              }
              userErrors {
                field
                message
              }
            }
          }`;
        const response = await admin.graphql(gql, {
          variables: { id: cartId }
        });
        const data = await response.json();
        if (data.data.draftOrderComplete.userErrors.length > 0) {
          return json({ error: data.data.draftOrderComplete.userErrors[0].message }, { status: 400 });
        }
        return json({ checkoutUrl: data.data.draftOrderComplete.draftOrder.order.statusPageUrl });
      }
      case 'order_status': {
        // Get order status
        const { orderId } = parameters || {};
        if (!orderId) return json({ error: 'Missing orderId' }, { status: 400 });
        const gql = `#graphql
          query getOrder($id: ID!) {
            order(id: $id) {
              id
              name
              statusPageUrl
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
