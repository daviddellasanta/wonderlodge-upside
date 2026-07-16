const fetch = require('node-fetch');

// TODO: PriceLabs' public Customer API docs don't clearly document a
// region-level market/comp endpoint (only listing-level `neighborhood_data`
// is confirmed). Swap this stub out for the real call once the exact
// endpoint + params are confirmed from the PriceLabs account's API
// reference (developers.pricelabs.co/customer-api).
async function fetchMarketComp(region, periodStart, periodEnd) {
  const { PRICELABS_API_KEY } = process.env;

  if (!PRICELABS_API_KEY) {
    throw new Error('Missing PRICELABS_API_KEY environment variable');
  }

  // Placeholder response shaped like what we expect the real PriceLabs
  // market/comp response to look like, so downstream mapping code doesn't
  // need to change once the real request is wired in.
  const stubbedResponse = {
    region,
    period_start: periodStart,
    period_end: periodEnd,
    occupancy_pct: 62.5,
    adr: 215.4,
    revpar: 134.6,
  };

  return stubbedResponse;

  /* Real call, once the endpoint/params are confirmed:
  const url = `https://api.pricelabs.co/v1/neighborhood_data?region=${encodeURIComponent(region)}&start_date=${periodStart}&end_date=${periodEnd}`;
  const response = await fetch(url, {
    headers: { 'X-API-Key': PRICELABS_API_KEY },
  });

  if (!response.ok) {
    throw new Error(`PriceLabs API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
  */
}

module.exports = { fetchMarketComp };
