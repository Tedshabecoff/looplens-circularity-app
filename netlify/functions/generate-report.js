// Loop Lens — Netlify Serverless Function
// Calls Anthropic API to generate report, then logs lead + emails report via Brevo
// Required env vars: ANTHROPIC_API_KEY, BREVO_API_KEY, BREVO_SENDER_EMAIL

const SYSTEM_PROMPT = `You are a senior circular economy consultant and Material Flow Analysis (MFA) specialist at Loop Lens. Generate a concise professional Circularity Snapshot Report from questionnaire answers.

Use exactly these section headers:
## Circularity Maturity Score: X/10
[one sentence rationale]

## Executive Summary
[2 D0short paragraphs on the company's circular economy position]

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

const SECTIONS = [
  { id: "context",    title: "Company Context" },
  { id: "inputs",     title: "Material Inputs" },
  { id: "waste",      title: "Waste & Outputs" },
  { id: "packaging",  title: "Packaging" },
  { id: "compliance", title: "Reporting & Compliance" },
  { id: "maturity",   title: "Circular Economy Maturity" },
];

const QUESTION_LABELS = {
  industry:       "Industry / sector",
  size:           "Employee count",
  geography:      "Primary operating region",
  materials:      "Primary raw materials / inputs",
  recycled_pct:   "% inputs from recycled sources",
  supplier_viz:   "Tier 1 supplier material flow visibility (1–5)",
  waste_types:    "Waste types generated",
  landfill_div:   "% waste diverted from landfill",
  waste_tracking: "Tracks waste by material type and weight",
  has_pkg:        "Uses product packaging",
  pkg_circularity:"Packaging circularity attributes",
  csrd:           "CSRD obligation (current or expected within 2 yrs)",
  scope3:         "Measuring Scope 3 upstream material emissions",
  ce_strategy:    "Formal circular economy / resource efficiency strategy",
  barriers:       "Biggest barriers to improving circularity",
};

function buildUserMessage(answers, lead) {
  const lines = [`Company: ${lead.company}`, `Contact: ${lead.name}`, ""];
  Object.entries(QUESTION_LABELS).forEach(([id, label]) => {
    const v = answers[id];
    if (v !== undefined && v !== "") {
      lines.push(`${label}: ${Array.isArray(v) ? v.join(", ") : v}`);
    }
  });
  return lines.join("\n");
}

// Convert report markdown to plain-text HTML for email
function reportToHtml(report, lead) {
  const rows = report.split("##").filter(Boolean).map(s => {
    const lines = s.trim().split("\n");
    return { title: lines[0].trim(), body: lines.slice(1).join("\n").trim() };
  });

  const sectionsHtml = rows.map(r => `
    <h2 style="font-family:Georgia,serif;font-size:18px;color:#1B3A2D;margin:24px 0 10px;">${r.title}</h2>
    <div style="font-size:14px;color:#3D5A4A;line-height:1.7;">${
      r.body
        .split("\n")
        .map(line => {
          if (line.startsWith("•") || line.startsWith("-"))
            return `<p style="margin:4px 0;">&#8226; ${line.replace(/^[•\-]\s*/, "")}</p>`;
          if (/^\d\./.test(line))
            return `<p style="margin:6px 0;"><strong>${line.match(/^\d/)[0]}.</strong> ${line.replace(/^\d\.\s*/, "")}</p>`;
          if (!line.trim()) return "<br/>";
          return `<p style="margin:6px 0;">${line}</p>`;
        })
        .join("")
    }</div>
  `).join("<hr style='border:0;border-top:1px solid #D8E8DC;margin:20px 0;'/>");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Loop Lens Circularity Report</title></head>
<body style="margin:0;padding:0;background:#F5F0E8;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;max-width:600px;">
        <tr>
          <td style="background:#1B3A2D;padding:28px 36px;">
            <p style="color:#C9913D;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">Loop Lens</p>
            <h1 style="font-family:Georgia,serif;font-size:28px;color:#F5F0E8;font-weight:400;margin:0 0 6px;">Circularity Snapshot Report</h1>
            <p style="color:#8BAF8B;font-size:13px;margin:0;">${lead.company} · ${lead.name}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;font-family:system-ui,sans-serif;">
            ${sectionsHtml}
            <div style="background:#1B3A2D;padding:24px;text-align:center;margin-top:28px;">
              <p style="color:#8BAF8B;font-size:13px;margin:0 0 12px;">Ready to go deeper?</p>
              <a href="https://www.looplens.co" style="display:inline-block;background:#C9913D;color:#1B3A2D;padding:12px 28px;font-size:14px;font-weight:600;text-decoration:none;">Connect with Loop Lens →</a>
            </div>
            <p style="text-align:center;color:#9BB09F;font-size:11px;margin-top:20px;">© Loop Lens · looplens.co</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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

  const { answers, lead } = body;

  // ── 1. Generate report via Anthropic ────────────────────────────────────────
  let reportText;
  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserMessage(answers, lead) }],
      }),
    });
    const anthropicData = await anthropicRes.json();
if (!anthropicRes.ok || anthropicData.type === 'error') {
  console.error("Anthropic API error:", JSON.stringify(anthropicData));
  throw new Error("Anthropic API error: " + JSON.stringify(anthropicData));
}
reportText = anthropicData.content?.[0]?.text;
if (!reportText) throw new Error("Empty Anthropic response");
  } catch (err) {
    console.error("Anthropic error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Report generation failed" }) };
  }

  // ── 2. Log lead in Brevo CRM ─────────────────────────────────────────────────
  // Extract circularity score from report for CRM tagging
  const scoreMatch = reportText.match(/Score:\s*(\d+)\/10/);
  const score = scoreMatch ? scoreMatch[1] : "unknown";

  try {
    await fetch("https://api.brevo.com/v3/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email: lead.email,
        attributes: {
          FIRSTNAME: lead.name.split(" ")[0] || lead.name,
          LASTNAME:  lead.name.split(" ").slice(1).join(" ") || "",
          COMPANY:   lead.company,
          CIRCULARITY_SCORE: score,
          SOURCE:    "Circularity Snapshot Tool",
        },
         listIds: [], // ← Replace 2 with your Brevo "Loop Lens Leads" list ID
        updateEnabled: true,
      }),
    });
  } catch (err) {
    // Non-fatal — log but continue
    console.error("Brevo CRM error:", err);
  }

  // ── 3. Email report via Brevo ─────────────────────────────────────────────────
  try {
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: {
          name: "Loop Lens",
          email: process.env.BREVO_SENDER_EMAIL, // must be verified in Brevo
        },
        to: [{ email: lead.email, name: lead.name }],
cc: [{ email: "tshabecoff@gmail.com", name: "Ted Shabecoff" }],
        subject: `Your Circularity Snapshot Report — ${lead.company}`,
        htmlContent: reportToHtml(reportText, lead),
      }),
    });
  } catch (err) {
    console.error("Brevo email error:", err);
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report: reportText }),
  };
};
