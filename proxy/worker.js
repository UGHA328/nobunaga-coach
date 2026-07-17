// ============================================================
// 노부나가 편성 코치 — LLM 프록시 (Cloudflare Worker)
// 목적: API 키를 서버(환경변수 Secret)에만 두고 브라우저에 노출하지 않음.
//       앱은 이 Worker만 호출 → Worker가 Gemini/Groq로 대신 요청(키 첨부).
//
// [배포 방법 — Cloudflare 대시보드]
// 1) https://dash.cloudflare.com → 가입/로그인(무료)
// 2) 왼쪽 메뉴 "Workers & Pages" → "Create" → "Create Worker"
// 3) 이름 예: nobunaga-proxy → Deploy → "Edit code"
// 4) 이 파일 내용 전체를 붙여넣고 → Deploy(저장)
// 5) 상단 Settings → Variables and Secrets 에서 아래 4개를 "Secret"으로 추가:
//      GEMINI_KEY_1, GEMINI_KEY_2, GROQ_KEY_1, GROQ_KEY_2  (값은 각 API 키)
//    (키는 여기 대시보드에만 입력 — 채팅/코드에 안 남습니다)
// 6) 배포된 URL 확인 (예: https://nobunaga-proxy.<계정>.workers.dev)
//    → 이 URL을 앱의 PROXY_URL 에 넣으면 완료 (Claude가 반영)
// ============================================================

const ALLOW = [
  "https://ugha328.github.io",
  "http://localhost:8123",
  "http://127.0.0.1:8123"
];
const GROQ_TEXT = "llama-3.3-70b-versatile";
const GROQ_VISION = "meta-llama/llama-4-scout-17b-16e-instruct";

function corsHeaders(origin) {
  const o = ALLOW.includes(origin) ? origin : ALLOW[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function toMessages(contents) {
  return contents.map(c => {
    const role = c.role === "model" ? "assistant" : "user";
    const txt = (c.parts || []).filter(p => p.text).map(p => p.text).join("\n");
    const imgs = (c.parts || []).filter(p => p.inline_data);
    if (imgs.length) {
      const arr = [{ type: "text", text: txt }];
      imgs.forEach(p => arr.push({ type: "image_url", image_url: { url: `data:${p.inline_data.mime_type};base64,${p.inline_data.data}` } }));
      return { role, content: arr };
    }
    return { role, content: txt };
  });
}

async function callGemini(model, contents, jsonSchema, key) {
  const body = { contents, generationConfig: { temperature: 0.4, maxOutputTokens: jsonSchema ? 16384 : 8192 } };
  if (jsonSchema) { body.generationConfig.responseMimeType = "application/json"; body.generationConfig.responseSchema = jsonSchema; }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error("Gemini: " + ((d.error && d.error.message) || ("HTTP " + r.status)));
  return (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts || [])
    .filter(p => p && p.text).map(p => p.text).join("") || "";
}

async function callGroq(contents, jsonSchema, key) {
  const hasImg = contents.some(c => (c.parts || []).some(p => p.inline_data));
  const body = { model: hasImg ? GROQ_VISION : GROQ_TEXT, messages: toMessages(contents), temperature: 0.4, max_tokens: 8192 };
  if (jsonSchema) body.response_format = { type: "json_object" };
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions",
    { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error("Groq: " + ((d.error && d.error.message) || ("HTTP " + r.status)));
  return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "";
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const ch = corsHeaders(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: ch });
    if (request.method !== "POST") return new Response("POST only", { status: 405, headers: ch });

    let payload;
    try { payload = await request.json(); }
    catch (e) { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: { ...ch, "Content-Type": "application/json" } }); }

    const { model, contents, jsonSchema } = payload;
    // 우선순위: 제미나이#3 → 제미나이#2 → Groq#1 → Groq#2 (env에 있는 것만)
    const PROV = [
      { t: "gemini", k: env.GEMINI_KEY_1 },
      { t: "gemini", k: env.GEMINI_KEY_2 },
      { t: "groq", k: env.GROQ_KEY_1 },
      { t: "groq", k: env.GROQ_KEY_2 }
    ].filter(p => p.k);

    const gModel = (model && model.indexOf("gemini") === 0) ? model : "gemini-flash-lite-latest";
    const groqFirst = model === "groq";
    let order = [];
    if (groqFirst) {
      for (let i = 0; i < PROV.length; i++) if (PROV[i].t === "groq") order.push(i);
      for (let i = 0; i < PROV.length; i++) if (PROV[i].t === "gemini") order.push(i);
    } else {
      for (let i = 0; i < PROV.length; i++) order.push(i);
    }

    let lastErr = "";
    for (const idx of order) {
      const p = PROV[idx];
      try {
        const text = p.t === "gemini" ? await callGemini(gModel, contents, jsonSchema, p.k) : await callGroq(contents, jsonSchema, p.k);
        return new Response(JSON.stringify({ text }), { headers: { ...ch, "Content-Type": "application/json" } });
      } catch (e) { lastErr = (e && e.message) || String(e); }
    }
    return new Response(JSON.stringify({ error: "all providers failed: " + lastErr }), { status: 502, headers: { ...ch, "Content-Type": "application/json" } });
  }
};
