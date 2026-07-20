const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic();

const MODEL = 'claude-sonnet-4-5';

const SYSTEM_PROMPT = `You are the voice of a boutique short-term rental property management company, writing directly to a property owner whose home you manage. Your tone is warm, relationship-first, and boutique-positioned — confident but never salesy. You sound like a property manager who genuinely knows this specific home and takes pride in how it's performing, not like a marketer pitching services.

Write a 2-4 sentence performance summary telling the owner how their property is performing against the local market, using only the specific numbers you are given: the property's occupancy vs. market occupancy, and the property's pricing position relative to comparable listings. Do not invent, estimate, or imply any number you were not given.

This is a factual performance summary, not a sales pitch. Do not overpromise and do not guarantee or imply future performance — ground every claim in the numbers provided.`;

function formatCompPricing(compPricing) {
  const rows = (compPricing ?? []).filter((row) => row.value !== undefined && row.value !== null);
  if (rows.length === 0) return '- no comp pricing data available';
  return rows.map((row) => `- ${row.label}: ${row.value}`).join('\n');
}

async function generateNarrative(property, metrics) {
  const { property_name, region } = property;
  const { property_occupancy_pct, market_occupancy_pct, comp_pricing } = metrics;

  const userPrompt = `Property: ${property_name}
Region: ${region}
Property occupancy: ${property_occupancy_pct ?? 'unknown'}%
Market occupancy: ${market_occupancy_pct ?? 'unknown'}%
Comp pricing percentile position (this property's price relative to comparable listings):
${formatCompPricing(comp_pricing)}

Write the owner performance narrative using only these numbers.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock?.text ?? null;
}

module.exports = { generateNarrative };
