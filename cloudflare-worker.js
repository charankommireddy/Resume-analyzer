/* ============================================================
   AI Resume Checker — Cloudflare Worker Proxy
   Deploy this at: https://dash.cloudflare.com → Workers & Pages
   ============================================================

   Set your API key as an encrypted secret:
     wrangler secret put ANTHROPIC_API_KEY
   Or in the dashboard: Worker → Settings → Variables & Secrets

   ============================================================ */

export default {
    async fetch(request, env) {
        // Allow CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }

        const apiKey = env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: { message: 'API key not configured on Worker.' } }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const body = await request.text();

        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body,
        });

        const data = await anthropicRes.text();

        return new Response(data, {
            status: anthropicRes.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    },
};
