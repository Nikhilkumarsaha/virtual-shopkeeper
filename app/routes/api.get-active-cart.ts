import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';

export const action: ActionFunction = async ({ request }) => {
  try {
    const { customerAccessToken } = await request.json();
    if (!customerAccessToken) {
      return json({ cartId: null });
    }
    const shop = process.env.SHOPIFY_SHOP;
    const storefrontToken = process.env.SHOPIFY_STOREFRONT_API_TOKEN;
    if (!shop || !storefrontToken) {
      return json({ cartId: null });
    }
    const endpoint = `https://${shop}/api/2023-10/graphql.json`;
    const gql = `query getCustomerCarts($customerAccessToken: String!) {
      customer(customerAccessToken: $customerAccessToken) {
        lastIncompleteCheckout {
          id
        }
      }
    }`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken,
      },
      body: JSON.stringify({
        query: gql,
        variables: { customerAccessToken },
      }),
    });
    const data = await response.json();
    const cartId = data.data.customer && data.data.customer.lastIncompleteCheckout ? data.data.customer.lastIncompleteCheckout.id : null;
    return json({ cartId });
  } catch (err) {
    return json({ cartId: null, error: String(err) });
  }
};
