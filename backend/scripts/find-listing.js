require('dotenv').config();

const fetch = require('node-fetch');

const SEARCH_TERMS = ['luna', 'rio'];

async function main() {
  const { PRICELABS_API_KEY } = process.env;

  if (!PRICELABS_API_KEY) {
    throw new Error('Missing PRICELABS_API_KEY environment variable');
  }

  const response = await fetch('https://api.pricelabs.co/v1/listings', {
    headers: { 'X-API-Key': PRICELABS_API_KEY },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PriceLabs request failed: ${response.status} ${response.statusText} - ${body}`);
  }

  const body = await response.json();
  const listings = Array.isArray(body) ? body : body.listings || [];

  const matches = listings.filter((listing) => {
    const name = (listing.name || '').toLowerCase();
    return SEARCH_TERMS.some((term) => name.includes(term));
  });

  if (matches.length === 0) {
    console.log('No listings found matching "Luna" or "Rio".');
    return;
  }

  matches.forEach((listing) => {
    console.log({
      id: listing.id,
      pms: listing.pms,
      name: listing.name,
      city_name: listing.city_name,
      state: listing.state,
    });
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
