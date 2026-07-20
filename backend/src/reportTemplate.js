// PriceLabs' DFD ("days from date") window used for the occupancy comparison.
// Kept in sync with DEFAULT_DFD_WINDOW in index.js.
const OCCUPANCY_DFD_WINDOW = '-30';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function formatPercent(value) {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(1)}%`;
}

function formatCurrency(value) {
  return value === null || value === undefined ? '—' : `$${Number(value).toFixed(0)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getPropertyOccupancy(marketBenchmark) {
  return marketBenchmark?.raw_data?.data?.listing_level?.occupancy?.[OCCUPANCY_DFD_WINDOW] ?? null;
}

function getMarketOccupancy(marketBenchmark) {
  return marketBenchmark?.raw_data?.data?.market_level?.occupancy?.[OCCUPANCY_DFD_WINDOW] ?? null;
}

// The "Summary Table Base Price" block is keyed by property_name under Category, with
// parallel Labels/Y_values arrays (e.g. 25th/50th/75th/90th percentile, median booked price).
function getCompPricingRows(property, neighborhoodSnapshot) {
  const table = neighborhoodSnapshot?.raw_data?.data?.['Summary Table Base Price'];
  const labels = table?.Labels ?? [];
  const values = table?.Category?.[property.property_name]?.Y_values ?? [];

  return labels.map((label, i) => ({ label, value: values[i] }));
}

function buildReportHtml(property, marketBenchmark, neighborhoodSnapshot, narrative) {
  const propertyOccupancy = getPropertyOccupancy(marketBenchmark);
  const marketOccupancy = getMarketOccupancy(marketBenchmark);
  const pricingRows = getCompPricingRows(property, neighborhoodSnapshot);
  const periodLabel = `${formatDate(marketBenchmark.period_start)} – ${formatDate(marketBenchmark.period_end)}`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1E1008;
    background: #EDE7D9;
  }
  header {
    background: #1E1008;
    color: #EDE7D9;
    padding: 32px 56px;
  }
  header h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 28px;
    margin: 0 0 4px;
    color: #EDE7D9;
  }
  header .region {
    font-family: Georgia, serif;
    font-size: 14px;
    color: #C9A96E;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .page { padding: 40px 56px; }
  section { margin-bottom: 36px; }
  h2 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 18px;
    color: #1E1008;
    border-bottom: 2px solid #C9A96E;
    padding-bottom: 8px;
    margin-bottom: 20px;
  }
  .period { font-size: 12px; color: #1E1008; opacity: 0.6; margin: -12px 0 20px; }
  .occupancy-grid { display: flex; gap: 24px; }
  .stat-card {
    flex: 1;
    background: #ffffff;
    border: 1px solid #C9A96E;
    border-radius: 6px;
    padding: 20px;
    text-align: center;
  }
  .stat-card .label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #1E1008;
    opacity: 0.7;
    margin-bottom: 8px;
  }
  .stat-card .value {
    font-family: Georgia, serif;
    font-size: 32px;
    color: #1E1008;
  }
  table.pricing { width: 100%; border-collapse: collapse; background: #ffffff; }
  table.pricing th, table.pricing td {
    text-align: left;
    padding: 12px 16px;
    border-bottom: 1px solid #C9A96E;
  }
  table.pricing th {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #1E1008;
    opacity: 0.7;
  }
  table.pricing td.value {
    font-family: Georgia, serif;
    font-size: 18px;
    text-align: right;
  }
  footer { padding: 0 56px 40px; font-size: 11px; color: #1E1008; opacity: 0.6; }
  .narrative {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 15px;
    line-height: 1.6;
    font-style: italic;
    color: #1E1008;
    background: #ffffff;
    border-left: 3px solid #C9A96E;
    padding: 16px 20px;
    margin: 0;
  }
</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(property.property_name)}</h1>
    <div class="region">${escapeHtml(property.region)}</div>
  </header>
  <div class="page">
    ${
      narrative
        ? `<section>
      <h2>Owner Update</h2>
      <p class="narrative">${escapeHtml(narrative)}</p>
    </section>`
        : ''
    }
    <section>
      <h2>Occupancy</h2>
      <div class="period">${escapeHtml(periodLabel)}</div>
      <div class="occupancy-grid">
        <div class="stat-card">
          <div class="label">Property Occupancy</div>
          <div class="value">${formatPercent(propertyOccupancy)}</div>
        </div>
        <div class="stat-card">
          <div class="label">Market Occupancy</div>
          <div class="value">${formatPercent(marketOccupancy)}</div>
        </div>
      </div>
    </section>

    <section>
      <h2>Comp Pricing</h2>
      <table class="pricing">
        <thead>
          <tr><th>Metric</th><th style="text-align:right;">Price</th></tr>
        </thead>
        <tbody>
          ${pricingRows
            .map(
              (row) =>
                `<tr><td>${escapeHtml(row.label)}</td><td class="value">${formatCurrency(row.value)}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
    </section>
  </div>
  <footer>Generated ${escapeHtml(formatDate(new Date().toISOString()))} · Wonderlodge Upside</footer>
</body>
</html>`;
}

module.exports = { buildReportHtml, getCompPricingRows, getPropertyOccupancy, getMarketOccupancy };
