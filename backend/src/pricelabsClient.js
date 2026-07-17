const fetch = require('node-fetch');

const PRICELABS_BASE_URL = 'https://api.pricelabs.co';

class PriceLabsApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'PriceLabsApiError';
    this.status = status;
  }
}

function getApiKey() {
  const { PRICELABS_API_KEY } = process.env;

  if (!PRICELABS_API_KEY) {
    throw new Error('Missing PRICELABS_API_KEY environment variable');
  }

  return PRICELABS_API_KEY;
}

async function pricelabsGet(path, params) {
  const url = new URL(`${PRICELABS_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: { 'X-API-Key': getApiKey() },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new PriceLabsApiError(
        `PriceLabs rejected the API key (${response.status} ${response.statusText})`,
        response.status
      );
    }

    if (response.status === 404) {
      throw new PriceLabsApiError(
        `PriceLabs found no data for ${JSON.stringify(params)} (404 Not Found)`,
        404
      );
    }

    const body = await response.text();
    throw new PriceLabsApiError(
      `PriceLabs request to ${path} failed: ${response.status} ${response.statusText} - ${body}`,
      response.status
    );
  }

  return response.json();
}

// GET /v1/listing_metrics — listing-level metrics and market-level comparison data
// (occupancy, revenue, ADR, RevPAR, adjusted occupancy, base price ratio, min prices,
// last booked date) for a listing already connected to the PriceLabs account.
async function getListingMetrics(listingId, pmsName) {
  return pricelabsGet('/v1/listing_metrics', { listing_id: listingId, pms_name: pmsName });
}

// GET /v1/neighborhood_data — Neighborhood Tab stats for a listing (future percentile
// prices, future occ/new/canc, summary table base price, market KPI), broken down by
// bedroom category or custom compset.
async function getNeighborhoodData(listingId, pms) {
  return pricelabsGet('/v1/neighborhood_data', { listing_id: listingId, pms });
}

module.exports = { getListingMetrics, getNeighborhoodData, PriceLabsApiError };
