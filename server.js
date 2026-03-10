/* ============================================================
   AI RESUME CHECKER — server.js
   Secure Express proxy for Anthropic Claude API.
   Keeps ANTHROPIC_API_KEY out of the browser entirely.
   ============================================================ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

/* ── Middleware ─────────────────────────────────────────────── */
app.use(cors());
app.use(express.json());

// Serve static front-end files from the same directory
app.use(express.static(path.join(__dirname)));

/* ── Claude API Proxy ───────────────────────────────────────── */
/**
 * POST /api/claude
 * Forwards the request body to Anthropic, injects the API key
 * from the server environment, and returns the response.
 */
app.post('/api/claude', async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey || apiKey === 'your-anthropic-api-key-here') {
        return res.status(500).json({
            error: {
                message: 'ANTHROPIC_API_KEY is not set. Add it to your .env file.',
            },
        });
    }

    try {
        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(req.body),
        });

        const data = await anthropicRes.json();

        // Forward the same HTTP status code Anthropic returned
        res.status(anthropicRes.status).json(data);
    } catch (err) {
        console.error('[proxy] Fetch to Anthropic failed:', err.message);
        res.status(502).json({
            error: { message: `Proxy error: ${err.message}` },
        });
    }
});

/* ── Catch-all: serve ram.html for any unknown route ─────────── */
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'ram.html'));
});

/* ── Start ──────────────────────────────────────────────────── */
app.listen(PORT, () => {
    console.log(`\n✅ AI Resume Checker running at http://localhost:${PORT}`);
    console.log(`   API key loaded: ${process.env.ANTHROPIC_API_KEY ? '✓ Yes' : '✗ No — check your .env file'}\n`);
});
