// ═══════════════════════════════════════════════════════════════════
// Mr. Finn — Setu AA Proxy Server
// Deploy this on Render.com (free) to fix the CORS issue
// ═══════════════════════════════════════════════════════════════════
// This server sits between your app and Setu's API.
// Your app → this proxy → Setu API → back to your app
// Your credentials stay safe on the server, never exposed to browser.
// ═══════════════════════════════════════════════════════════════════

const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app  = express();
app.use(cors()); // Allow your app to call this proxy
app.use(express.json());

// ── Your Setu credentials (safe here — this is server-side) ──────
const SETU = {
  clientId:          "fd5aa547-f861-427b-8358-c7401b820319",
  clientSecret:      "e9sSnnz5xax9D1zEnxPE007Kxu3visCl",
  productInstanceId: "370933ad-bf11-4fcc-abee-aa52c05cb835",
  baseUrl:           "https://fiu-sandbox.setu.co/v2",
};

// ── Setu AA uses direct header auth — no token exchange needed ────
async function setuRequest(method, path, body) {
  const url = `${SETU.baseUrl}${path}`;
  console.log(`Setu ${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type":            "application/json",
      "x-client-id":             SETU.clientId,
      "x-client-secret":         SETU.clientSecret,
      "x-product-instance-id":   SETU.productInstanceId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`Setu response (${res.status}):`, text.slice(0, 400));
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`); }
}

// ════════════════════════════════════════════════════════════════════
// ROUTES — your app calls these
// ════════════════════════════════════════════════════════════════════

// Health check
app.get("/", (req, res) => res.json({ status: "Mr. Finn proxy running ✓" }));

// Debug — shows exact raw response from Setu
app.get("/debug/token", async (req, res) => {
  try {
    const url = `${SETU.baseUrl}/consents?limit=1`;
    const rawRes = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type":           "application/json",
        "x-client-id":            SETU.clientId,
        "x-client-secret":        SETU.clientSecret,
        "x-product-instance-id":  SETU.productInstanceId,
        "clientApiKey":            SETU.clientSecret,
      },
    });
    const text = await rawRes.text();
    res.json({
      status:  rawRes.status,
      headers: Object.fromEntries(rawRes.headers.entries()),
      body:    text,
      urlCalled: url,
      credentialsUsed: {
        clientId:          SETU.clientId,
        productInstanceId: SETU.productInstanceId,
        baseUrl:           SETU.baseUrl,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// Debug — try alternate auth formats
app.get("/debug/auth-test", async (req, res) => {
  const results = [];

  const attempts = [
    {
      name: "x-client-id + x-client-secret",
      headers: { "x-client-id": SETU.clientId, "x-client-secret": SETU.clientSecret, "x-product-instance-id": SETU.productInstanceId },
    },
    {
      name: "clientApiKey only",
      headers: { "clientApiKey": SETU.clientSecret, "x-product-instance-id": SETU.productInstanceId },
    },
    {
      name: "Basic Auth",
      headers: { "Authorization": "Basic " + Buffer.from(`${SETU.clientId}:${SETU.clientSecret}`).toString("base64"), "x-product-instance-id": SETU.productInstanceId },
    },
    {
      name: "x-client-id as apiKey",
      headers: { "apiKey": SETU.clientId, "x-product-instance-id": SETU.productInstanceId },
    },
  ];

  for (const attempt of attempts) {
    try {
      const r = await fetch(`${SETU.baseUrl}/consents?limit=1`, {
        method:  "GET",
        headers: { "Content-Type": "application/json", ...attempt.headers },
      });
      const text = await r.text();
      results.push({ name: attempt.name, status: r.status, body: text.slice(0, 200) });
    } catch (e) {
      results.push({ name: attempt.name, error: e.message });
    }
  }

  res.json({ results, baseUrl: SETU.baseUrl });
});

// 1. Create consent → returns { consentId, redirectUrl }
app.post("/consent/create", async (req, res) => {
  try {
    const { mobile } = req.body;
    const now         = new Date();
    const consentStart= now.toISOString();
    const consentExpiry = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days
    const dataFrom    = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
    const dataTo      = now.toISOString();
    const txnid       = "mrfinn-" + Date.now();

    const body = {
      consentDuration: { unit: "MONTH", value: 3 },
      dataRange:       { from: dataFrom, to: dataTo },
      context: [{ key: "accounttype", value: "SAVINGS" }],
    };
    if (mobile) body.vua = `${mobile}@setu`;

    console.log("Consent request body:", JSON.stringify(body, null, 2));
    const data = await setuRequest("POST", "/consents", body);
    console.log("Consent response:", JSON.stringify(data, null, 2));

    if (!data.id) {
      return res.status(500).json({ error: "No consent ID returned", raw: data });
    }

    res.json({
      consentId:   data.id,
      redirectUrl: data.url,
      raw:         data,
    });
  } catch (e) {
    console.error("Consent creation error:", e);
    res.status(500).json({ error: e.message });
  }
});

// 2. Get consent status → returns { status }
app.get("/consent/status/:consentId", async (req, res) => {
  try {
    const data = await setuRequest("GET", `/consents/${req.params.consentId}`);
    res.json({ status: data.status, raw: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3. Create data session → returns { sessionId }
app.post("/session/create", async (req, res) => {
  try {
    const { consentId } = req.body;
    const now  = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
    const to   = now.toISOString();

    const data = await setuRequest("POST", "/sessions", {
      consentId,
      format:    "json",
      dataRange: { from, to },
    });

    res.json({ sessionId: data.id, raw: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4. Fetch FI data from session → returns transactions array
app.get("/session/data/:sessionId", async (req, res) => {
  try {
    const data = await setuRequest("GET", `/sessions/${req.params.sessionId}`);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Start
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Mr. Finn proxy running on port ${PORT}`));
