require('dotenv').config();

const express = require('express');
const supabase = require('./src/supabaseClient');
const { getListingMetrics, getNeighborhoodData, PriceLabsApiError } = require('./src/pricelabsClient');

const app = express();
app.use(express.json());

async function lookupProperty(listingId, pmsName) {
  const { data: property, error } = await supabase
    .from('properties')
    .select('region, property_name')
    .eq('listing_id', listingId)
    .eq('pms_name', pmsName)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return property;
}

// PriceLabs' listing_metrics response nests occupancy/adr/revpar under market_level,
// each keyed by DFD ("days from date") window, e.g. "-7", "-30", "-90". We default to
// the trailing 30-day window as a reasonable first cut.
const DEFAULT_DFD_WINDOW = '-30';

function extractMarketMetrics(marketLevel, dfdWindow) {
  const occupancy_pct = marketLevel?.occupancy?.[dfdWindow];
  const adr = marketLevel?.adr?.[dfdWindow];
  const revpar = marketLevel?.revpar?.[dfdWindow];

  if (occupancy_pct === undefined && adr === undefined && revpar === undefined) {
    throw new Error(
      `Unexpected PriceLabs listing_metrics response shape: no market_level metrics found for DFD window "${dfdWindow}"`
    );
  }

  return {
    occupancy_pct: occupancy_pct ?? null,
    adr: adr ?? null,
    revpar: revpar ?? null,
  };
}

// listing_metrics is a point-in-time snapshot, not a date-ranged report, so we derive
// a period from the DFD window ourselves: the trailing N days ending today.
function computePeriodForDfdWindow(dfdWindow) {
  const days = Math.abs(parseInt(dfdWindow, 10));
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);

  const toISODate = (date) => date.toISOString().slice(0, 10);

  return { period_start: toISODate(start), period_end: toISODate(end) };
}

app.post('/sync/market-benchmarks', async (req, res) => {
  const { listing_id, pms_name } = req.body;

  if (!listing_id || !pms_name) {
    return res.status(400).json({ error: 'listing_id and pms_name are required' });
  }

  try {
    const property = await lookupProperty(listing_id, pms_name);

    if (!property) {
      return res.status(404).json({
        error: 'Property not found in properties table — add it before syncing.',
      });
    }

    const metrics = await getListingMetrics(listing_id, pms_name);

    const { occupancy_pct, adr, revpar } = extractMarketMetrics(metrics.data.market_level, DEFAULT_DFD_WINDOW);
    const { period_start, period_end } = computePeriodForDfdWindow(DEFAULT_DFD_WINDOW);

    const { data, error } = await supabase
      .from('market_benchmarks')
      .insert({
        region: property.region,
        property_name: property.property_name,
        period_start,
        period_end,
        occupancy_pct,
        adr,
        revpar,
        source: 'pricelabs',
        raw_data: metrics,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (err) {
    if (err instanceof PriceLabsApiError) {
      return res.status(err.status).json({ error: err.message });
    }

    console.error('Failed to sync market benchmarks:', err);
    res.status(502).json({ error: 'Failed to sync market benchmarks', details: err.message });
  }
});

app.post('/sync/neighborhood-data', async (req, res) => {
  const { listing_id, pms_name } = req.body;

  if (!listing_id || !pms_name) {
    return res.status(400).json({ error: 'listing_id and pms_name are required' });
  }

  try {
    const property = await lookupProperty(listing_id, pms_name);

    if (!property) {
      return res.status(404).json({
        error: 'Property not found in properties table — add it before syncing.',
      });
    }

    const neighborhoodData = await getNeighborhoodData(listing_id, pms_name);

    const { data, error } = await supabase
      .from('neighborhood_snapshots')
      .insert({
        listing_id,
        pms_name,
        region: property.region,
        raw_data: neighborhoodData,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (err) {
    if (err instanceof PriceLabsApiError) {
      return res.status(err.status).json({ error: err.message });
    }

    console.error('Failed to sync neighborhood data:', err);
    res.status(502).json({ error: 'Failed to sync neighborhood data', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
