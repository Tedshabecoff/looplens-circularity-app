// Loop Lens — Circularity Snapshot Tool
// Generates report via Anthropic, then notifies ted@looplens.co via Netlify Forms.
// Required env var: ANTHROPIC_API_KEY   (Brevo is no longer required)

const SYSTEM_PROMPT = `You are a senior circular economy consultant and Material Flow Analysis (MFA) specialist at Loop Lens. Generate a concise professional Circularity Snapshot Report from questionnaire answers.

Use exactly these section headers:
## Circularity Maturity Score: X/10
[one sentence rationale]

## Executive Summary
[2 short paragraphs on the company's circular economy position]

## Key Findings
[3-4 specific bullet points starting with • tied directly to their answers]

## ESRS E5 Readiness
[2-3 sentences on readiness for ESRS E5 under CSRD]

## Priority Recommendations
1. [Specific recommendation]
2. [Specific recommendation]
3. [Specific recommendation]

## The MFA Opportunity
[2-3 sentences on how a Material Flow Analysis by Loop Lens would unlock deeper insights for this specific company]

Be specific. Reference their actual answers. Avoid generic statements.`;

const QUESTION_LABELS = {
  industry:        "Industry / sector",
  size:            "Employee count",
  geography:       "Primary operating region",
  materials:       "Primary raw materials / inputs",
  recycled_pct:    "% inputs from recycled sources",
  supplier_viz:    "Tier 1 supplier material flow visibility (1-5)",
  waste_types:     "Waste types generated",
  landfill_div:    "% waste diverted from landfill",
  waste_tracking:  "Tracks waste by material type and weight",
  has_pkg:         "Uses product packaging",
  pkg_circularity: "Packaging circularity attributes",
  csrd:            "CSRD obligation (current or expected within 2 yrs)",
  scope3:          "Measuring Scope 3 upstream material emissions",
  ce_strategy:     "Formal circular economy / resource efficiency strategy",
  barriers:        "Biggest barriers to improving circularity",
};

function val(v) {
  if (v === undefined || v === null || v === "") return "";
  return Array.isArray(v) ? v.join(", ") : String(v);
}

function buildUserMessage(answers, lead) {
  const lines = [`Company: ${lead.company}`, `Contact: ${lead.name}`, ""];
  Object.entries(QUESTION_LABELS).forEach(([id, label]) => {
    const v = val(answers[id]);
    if (v) lines.push(`${label}: ${v}`);
  });
  return lines.join("\n");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { answers = {}, lead = {} } = body;

  // ── 1. Generate the report ────────────────────────────────────────────────
  let reportText;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(answers, lead) }],
      }),
    });

    const data = await res.json();
    console.log("Anthropic status:", res.status);

    if (!res.ok || data.type === "error") {
      console.error("Anthropic error:", JSON.stringify(data));
      throw new Error("Anthropic error");
    }

    reportText = data.content?.[0]?.text;
    if (!reportText) throw new Error("Empty Anthropic response");
    console.log("Report generated, length:", reportText.length);

  } catch (err) {
    console.error("Report generation failed:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: "Report generation failed" }) };
  }

  // ── 2. Notify ted@looplens.co via Netlify Forms ───────────────────────────
  // No API key. Netlify emails whoever is configured under
  // Forms > circularity-lead > Form notifications.
  try {
    const scoreMatch = reportText.match(/Score:\s*(\d+)\s*\/\s*10/);
    const score = scoreMatch ? scoreMatch[1] + "/10" : "not parsed";

    const answersFull = Object.entries(QUESTION_LABELS)
      .map(([id, label]) => {
        const v = val(answers[id]);
        return v ? `${label}: ${v}` : null;
      })
      .filter(Boolean)
      .join(" | ");

    const payload = new URLSearchParams({
      "form-name":   "circularity-lead",
      name:          lead.name    || "",
      email:         lead.email   || "",
      company:       lead.company || "",
      score:         score,
      industry:      val(answers.industry),
      size:          val(answers.size),
      geography:     val(answers.geography),
      csrd:          val(answers.csrd),
      scope3:        val(answers.scope3),
      ce_strategy:   val(answers.ce_strategy),
      barriers:      val(answers.barriers),
      answers_full:  answersFull,
    });

    // process.env.URL is set automatically by Netlify to the site's primary URL
    const siteUrl = process.env.URL || "https://circularity.looplens.co";

    const formRes = await fetch(siteUrl + "/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString(),
    });

    console.log("Netlify Forms status:", formRes.status);
    if (!formRes.ok) {
      console.error("Netlify Forms rejected the submission:", formRes.status, await formRes.text());
    } else {
      console.log("Lead captured:", lead.email, "| score:", score);
    }

  } catch (err) {
    // Never block the user's report on a notification failure
    console.error("Lead notification failed:", err.message);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report: reportText }),
  };
};
