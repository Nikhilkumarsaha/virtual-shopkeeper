import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';

export const action: ActionFunction = async ({ request }) => {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return json({ error: 'Missing email or password' }, { status: 400 });
    }
    // Shopify Storefront API endpoint and token
    const shop = process.env.SHOPIFY_SHOP;
    const storefrontToken = process.env.SHOPIFY_STOREFRONT_API_TOKEN;
    if (!shop || !storefrontToken) {
      return json({ error: 'Shopify Storefront API not configured' }, { status: 500 });
    }
    const endpoint = `https://${shop}/api/2023-10/graphql.json`;
    const gql = `mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken { accessToken expiresAt }
        userErrors { field message }
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
        variables: { input: { email, password } },
      }),
    });
    const data = await response.json();
    const result = data.data.customerAccessTokenCreate;
    if (result.customerAccessToken && result.customerAccessToken.accessToken) {
      return json({ accessToken: result.customerAccessToken.accessToken });
    } else {
      const errorMsg = result.userErrors && result.userErrors.length > 0 ? result.userErrors[0].message : 'Login failed';
      return json({ error: errorMsg }, { status: 401 });
    }
  } catch (err) {
    return json({ error: 'Internal server error', details: String(err) }, { status: 500 });
  }
};
