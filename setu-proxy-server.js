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

// ── Request signing private key (matches public key on Setu Bridge) ─
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCnAuqrwDCkph9O
tIT4yGlghbb6CMij3uN8DcJ6UrmmDd7ycdkrFH6JfaOLyU9pXzPfFyZDE5o3Ma3P
KHTxOd1jZq0oN+mn7knRd4P0YE4IJfYJA9qHkbYLuFTGLzyxomHjPHfk47xHf8oP
8JtW0g3hd1f4qDi3w2bQmZEKFPwOxJcqd8ppibMvXAavKCGxIRsazAcRU/fiR0TC
ch/xLtqvj0hjO3LJ1CBgJtHntgDII9A45fxSitIqCyQ+stdacgNDXlca87iVPish
AgoR9NzTYqqa0SpQPi5igONR3WP9AH1T2ax2LbbVMaFUWlZ1aFixJuYqUC4FL4n+
3hHiKAtNAgMBAAECggEAJwcCtUN6aoNqdf8vwp48p8JffaLfVhHwGW1yuJiLyw7b
Pk8V91/46OK7/N68aKyHZ9bWSV7zjvnUOsBiwXsq7b9Q8ADO4IAJ7oHOC2WU3okW
a0lkAAGwJ6F55/0iYwVF+C7JeqqwNQoa+yoX9swr07gKjfArnt+x70Wvk8pPE5kC
7Rf7zN7zz0PwH9NId63s63gSXkA/HhRtBDQa7leMMqCC58qYYRG15CnpvbATvFxl
clbDEEnp/b26VEqL+ydmMZvJVF8xDWZ3RxKM3d9XOnRTIEsSGNVLYztSN2sgMW8A
KFDBunrE4BgWfosXFbq5C5bVQcbHE7Fq9j9yhlcuGQKBgQDSwmOyR/04RgtxhsM3
ql6ho87uJjTaxcaUM2Qp2nhw19pOxI60uzToMgo1FOBy91s/XS9Rl0lbLpUV8Cen
rGxAyuylmq1qGSvhQrp8HHJ7ihZVH2OB7Md80lI3Sb5KT2Bo9la9RAuLTU3cuIhi
Jb07Za2J6zulQyQ1Ei7oD2e9JQKBgQDK3H96otvbVnDCKTXszll0gZDX+MOUX7iI
IRQaJVS6q2KoMy3NmJKbo0GG78OdaZxTg+n2GTZJFx9Q21GdxHUOhgjTvsIjqlHj
veUy+cF/ZBOAraKutoKWZByLYazpfDn/hgt4HKY+sIXEzpwqIY+P4I6UX1diMvTG
c7q6+8xBCQKBgQDKcWxgKGQj9KwzTTYhNyYU74rqGIr2hbj8S+zvgunjwoLw3D8T
fSsRylchq774z363e6PjJIWS70jHPNpqZeXJyuHLJKtkWW9bvcPxSUXyQq627yKe
/ziTPlc4wj3llR9PUyf4Pu8zzHp5BEwEsql073LlIq41TSvvSlsCDyIffQKBgGzX
r8JB/UqK74cNi3RaJt7+4ZMvUuiaDy1i6iE5JGPfrthmVU35bbf5+R+IJ2GfF5Qr
s+0qC9ldgZzlf73xeYjoW3YY5Js0OCnEamRWYv6R2HDzONUa8af1YOdb6eWAlLHH
3wF8BaqfFbbJ0Do+tYNRzc5H9V+nzXNpBqhqj2XZAoGAVIaIphCxxtT8Irg0g+99
chzpSsooBY7Pluqe7LNtV8pUuqB5eBY7/NHrKImIOnYVx5SZtgt5iEPOHKFi9vQl
XeZxRC6CE78jPHN0H18S5rSnYgkWkAqt6cW46+2z8GBIItBdFImabUdle78CDNKG
qKwQ3F8WWTn+LoZzKTx1DQc=
-----END PRIVATE KEY-----`;

const crypto = require("crypto");

// Sign request body with private key → x-jws-signature header
function signBody(body) {
  const sign = crypto.createSign("SHA256");
  sign.update(typeof body === "string" ? body : JSON.stringify(body));
  sign.end();
  return sign.sign(PRIVATE_KEY, "base64");
}
async function setuRequest(method, path, body) {
  const url     = `${SETU.baseUrl}${path}`;
  const bodyStr = body ? JSON.stringify(body) : "";
  const headers = {
    "Content-Type":          "application/json",
    "x-client-id":           SETU.clientId,
    "x-client-secret":       SETU.clientSecret,
    "x-product-instance-id": SETU.productInstanceId,
  };
  if (bodyStr) headers["x-jws-signature"] = signBody(bodyStr);
  console.log(`Setu ${method} ${url}`);
  const res  = await fetch(url, { method, headers, body: bodyStr || undefined });
  const text = await res.text();
  console.log(`Setu response (${res.status}):`, text.slice(0, 400));
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`Non-JSON (${res.status}): ${text.slice(0, 200)}`); }
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

// Webhook — Setu posts consent/FI status updates here
app.post("/webhook", (req, res) => {
  console.log("Setu webhook received:", JSON.stringify(req.body));
  res.json({ success: true });
});

// Consent redirect — Setu sends user here after approval/rejection
// Passes consentId and status as query params, redirects back to the app
app.get("/consent-redirect", (req, res) => {
  const { consentId, status, errorcode } = req.query;
  console.log("Consent redirect received:", { consentId, status, errorcode });
  // Redirect back to the app with the result
  // The app reads these params and continues the flow
  res.send(`
    <html>
      <body style="background:#07090c;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px">
        <div style="font-size:48px">${status === "REJECTED" || errorcode ? "❌" : "✅"}</div>
        <div style="font-size:20px;font-weight:bold">${status === "REJECTED" || errorcode ? "Consent rejected" : "Consent approved!"}</div>
        <div style="color:rgba(255,255,255,0.5);font-size:14px">Return to the app and tap "I approved it ✓"</div>
        <div style="color:rgba(255,255,255,0.3);font-size:12px;margin-top:8px">Consent ID: ${consentId || "N/A"}</div>
      </body>
    </html>
  `);
});

// Start
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Mr. Finn proxy running on port ${PORT}`));
