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
  baseUrl:           "https://fiu-sandbox.setu.co",
};

// ── Token cache (reuse token until it expires) ────────────────────
let cachedToken    = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const res  = await fetch(`${SETU.baseUrl}/auth/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ clientID: SETU.clientId, secret: SETU.clientSecret }),
  });
  const data = await res.json();
  if (!data.accessToken) throw new Error("Token fetch failed: " + JSON.stringify(data));
  cachedToken    = data.accessToken;
  tokenExpiresAt = Date.now() + (data.expiresIn || 1800) * 1000 - 60000; // refresh 1 min early
  return cachedToken;
}

// ── Shared Setu request helper ────────────────────────────────────
async function setuRequest(method, path, body) {
  const token = await getToken();
  const res   = await fetch(`${SETU.baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type":            "application/json",
      Authorization:             `Bearer ${token}`,
      "x-product-instance-id":   SETU.productInstanceId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ════════════════════════════════════════════════════════════════════
// ROUTES — your app calls these
// ════════════════════════════════════════════════════════════════════

// Health check
app.get("/", (req, res) => res.json({ status: "Mr. Finn proxy running ✓" }));

// Debug — test token only
app.get("/debug/token", async (req, res) => {
  try {
    const token = await getToken();
    res.json({ success: true, tokenPreview: token.slice(0, 20) + "..." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
      ver:       "2.1.0",
      timestamp: now.toISOString(),
      txnid,
      ConsentDetail: {
        consentStart,
        consentExpiry,
        consentMode:  "STORE",
        fetchType:    "ONETIME",
        consentTypes: ["TRANSACTIONS", "SUMMARY"],
        fiTypes:      ["DEPOSIT"],
        DataConsumer: { id: "setu-fiu-id", type: "FIU" },
        Customer: {
          id: mobile ? `${mobile}@setu` : "customer@setu",
          Identifiers: mobile ? [{ type: "MOBILE", value: mobile }] : [],
        },
        Purpose: {
          code:   "101",
          refUri: "https://api.rebit.org.in/aa/purpose/101.xml",
          text:   "Personal Finance Management",
          Category: { type: "string" },
        },
        FIDataRange: { from: dataFrom, to: dataTo },
        DataLife:    { unit: "MONTH",  value: 3 },
        Frequency:   { unit: "HOUR",   value: 24 },
      },
    };

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
