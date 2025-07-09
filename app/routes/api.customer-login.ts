import { json } from '@remix-run/node';
import type { ActionFunction } from '@remix-run/node';

export const action: ActionFunction = async ({ request }) => {
  try {
    const body = await request.json();
    const { email, password } = body;
    if (!email || !password) {
      return json({ error: 'Missing email or password' }, { status: 400 });
    }
    // Call Shopify Storefront API for customerAccessTokenCreate
    const shop = process.env.SHOPIFY_SHOP_DOMAIN;
    const storefrontToken = process.env.SHOPIFY_STOREFRONT_API_TOKEN;
    if (!shop || !storefrontToken) {
      return json({ error: 'Shopify configuration missing' }, { status: 500 });
    }
    const endpoint = `https://${shop}/api/2023-10/graphql.json`;
    const mutation = `mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {\n  customerAccessTokenCreate(input: $input) {\n    customerAccessToken {\n      accessToken\n      expiresAt\n    }\n    customerUserErrors {\n      code\n      field\n      message\n    }\n  }\n}`;
    const variables = { input: { email, password } };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });
    const data = await res.json();
    const result = data.data?.customerAccessTokenCreate;
    if (result?.customerAccessToken?.accessToken) {
      return json({ accessToken: result.customerAccessToken.accessToken });
    } else {
      const errorMsg = result?.customerUserErrors?.[0]?.message || 'Invalid credentials';
      return json({ error: errorMsg }, { status: 401 });
    }
  } catch (err) {
    return json({ error: 'Failed to login' }, { status: 500 });
  }
};
