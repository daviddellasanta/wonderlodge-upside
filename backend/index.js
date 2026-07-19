require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const supabase = require('./src/supabaseClient');
const { getListingMetrics, getNeighborhoodData, PriceLabsApiError } = require('./src/pricelabsClient');
const { buildReportHtml, getCompPricingRows, getPropertyOccupancy, getMarketOccupancy } = require('./src/reportTemplate');

const app = express();

const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://wonderlodge-upside-admin.vercel.app'];

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

const GENERATED_REPORTS_DIR = path.join(__dirname, 'generated-reports');
fs.mkdirSync(GENERATED_REPORTS_DIR, { recursive: true });

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

async function fetchLatestMarketBenchmark(listingId, pmsName) {
  const { data, error } = await supabase
    .from('market_benchmarks')
    .select('*')
    .eq('listing_id', listingId)
    .eq('pms_name', pmsName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function fetchLatestNeighborhoodSnapshot(listingId, pmsName) {
  const { data, error } = await supabase
    .from('neighborhood_snapshots')
    .select('*')
    .eq('listing_id', listingId)
    .eq('pms_name', pmsName)
    .order('captured_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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

// Shared sync logic used by both the single-property endpoints and the
// all-properties batch endpoint, so the PriceLabs call + Supabase write for
// each data type lives in exactly one place.

async function syncMarketBenchmarksForProperty(property) {
  const metrics = await getListingMetrics(property.listing_id, property.pms_name);

  const { occupancy_pct, adr, revpar } = extractMarketMetrics(metrics.data.market_level, DEFAULT_DFD_WINDOW);
  const { period_start, period_end } = computePeriodForDfdWindow(DEFAULT_DFD_WINDOW);

  const { data, error } = await supabase
    .from('market_benchmarks')
    .insert({
      listing_id: property.listing_id,
      pms_name: property.pms_name,
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

  return data;
}

async function syncNeighborhoodDataForProperty(property) {
  const neighborhoodData = await getNeighborhoodData(property.listing_id, property.pms_name);

  const { data, error } = await supabase
    .from('neighborhood_snapshots')
    .insert({
      listing_id: property.listing_id,
      pms_name: property.pms_name,
      region: property.region,
      raw_data: neighborhoodData,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// TODO: no auth on this yet — fine for local dev, but this needs an auth check
// before the admin UI is deployed publicly.
app.get('/properties', async (req, res) => {
  const { data, error } = await supabase
    .from('properties')
    .select('listing_id, pms_name, property_name, region, owner_name, active');

  if (error) {
    console.error('Failed to load properties:', error);
    return res.status(502).json({ error: 'Failed to load properties', details: error.message });
  }

  res.status(200).json(data);
});

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

    const data = await syncMarketBenchmarksForProperty({ listing_id, pms_name, ...property });

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

    const data = await syncNeighborhoodDataForProperty({ listing_id, pms_name, ...property });

    res.status(201).json(data);
  } catch (err) {
    if (err instanceof PriceLabsApiError) {
      return res.status(err.status).json({ error: err.message });
    }

    console.error('Failed to sync neighborhood data:', err);
    res.status(502).json({ error: 'Failed to sync neighborhood data', details: err.message });
  }
});

// Delay between properties in the batch sync, so we don't hammer the
// PriceLabs API when running this against the full active property list.
const ALL_PROPERTIES_SYNC_DELAY_MS = 500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function describeError(err) {
  return err instanceof PriceLabsApiError || err instanceof Error ? err.message : String(err);
}

app.post('/sync/all-properties', async (req, res) => {
  const { data: properties, error } = await supabase
    .from('properties')
    .select('listing_id, pms_name, property_name, region')
    .eq('active', true);

  if (error) {
    console.error('Failed to load active properties:', error);
    return res.status(502).json({ error: 'Failed to load active properties', details: error.message });
  }

  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < properties.length; i++) {
    const property = properties[i];
    const result = {
      listing_id: property.listing_id,
      pms_name: property.pms_name,
      property_name: property.property_name,
      region: property.region,
      market_benchmarks: null,
      neighborhood_data: null,
    };

    try {
      await syncMarketBenchmarksForProperty(property);
      result.market_benchmarks = { status: 'success' };
    } catch (err) {
      result.market_benchmarks = { status: 'failed', error: describeError(err) };
    }

    try {
      await syncNeighborhoodDataForProperty(property);
      result.neighborhood_data = { status: 'success' };
    } catch (err) {
      result.neighborhood_data = { status: 'failed', error: describeError(err) };
    }

    const propertySucceeded =
      result.market_benchmarks.status === 'success' && result.neighborhood_data.status === 'success';

    result.status = propertySucceeded ? 'success' : 'failed';
    propertySucceeded ? succeeded++ : failed++;

    results.push(result);

    if (i < properties.length - 1) {
      await sleep(ALL_PROPERTIES_SYNC_DELAY_MS);
    }
  }

  res.status(200).json({
    total: properties.length,
    succeeded,
    failed,
    results,
  });
});

app.post('/reports/generate', async (req, res) => {
  const { listing_id, pms_name } = req.body;

  if (!listing_id || !pms_name) {
    return res.status(400).json({ error: 'listing_id and pms_name are required' });
  }

  try {
    const property = await lookupProperty(listing_id, pms_name);

    if (!property) {
      return res.status(404).json({
        error: 'Property not found in properties table — add it before generating a report.',
      });
    }

    const [marketBenchmark, neighborhoodSnapshot] = await Promise.all([
      fetchLatestMarketBenchmark(listing_id, pms_name),
      fetchLatestNeighborhoodSnapshot(listing_id, pms_name),
    ]);

    const missing = [];
    if (!marketBenchmark) missing.push('market_benchmarks');
    if (!neighborhoodSnapshot) missing.push('neighborhood_snapshots');

    if (missing.length > 0) {
      return res.status(404).json({
        error: `Missing ${missing.join(' and ')} data for this property — run /sync/all-properties first.`,
      });
    }

    const fullProperty = { listing_id, pms_name, ...property };
    const html = buildReportHtml(fullProperty, marketBenchmark, neighborhoodSnapshot);

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    let pdfBuffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true });
    } finally {
      await browser.close();
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const pdfPath = path.join(GENERATED_REPORTS_DIR, `${listing_id}-${dateStr}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    const metrics = {
      property_occupancy_pct: getPropertyOccupancy(marketBenchmark),
      market_occupancy_pct: getMarketOccupancy(marketBenchmark),
      comp_pricing: getCompPricingRows(fullProperty, neighborhoodSnapshot),
    };

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        property_id: listing_id,
        period_start: marketBenchmark.period_start,
        period_end: marketBenchmark.period_end,
        metrics,
        narrative: null,
        pdf_url: pdfPath,
      })
      .select()
      .single();

    if (reportError) {
      throw reportError;
    }

    res.status(201).json(report);
  } catch (err) {
    console.error('Failed to generate report:', err);
    res.status(502).json({ error: 'Failed to generate report', details: err.message });
  }
});

app.get('/reports', async (req, res) => {
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, property_id, period_start, period_end, status, pdf_url, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load reports:', error);
    return res.status(502).json({ error: 'Failed to load reports', details: error.message });
  }

  if (reports.length === 0) {
    return res.status(200).json([]);
  }

  const listingIds = [...new Set(reports.map((report) => report.property_id))];

  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select('listing_id, property_name, region')
    .in('listing_id', listingIds);

  if (propertiesError) {
    console.error('Failed to load properties for reports:', propertiesError);
    return res
      .status(502)
      .json({ error: 'Failed to load properties for reports', details: propertiesError.message });
  }

  const propertyByListingId = new Map(properties.map((property) => [property.listing_id, property]));

  const data = reports.map((report) => {
    const property = propertyByListingId.get(report.property_id);
    return {
      ...report,
      property_name: property?.property_name ?? null,
      region: property?.region ?? null,
    };
  });

  res.status(200).json(data);
});

app.get('/reports/:id/pdf', async (req, res) => {
  const { id } = req.params;

  const { data: report, error } = await supabase
    .from('reports')
    .select('pdf_url')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Failed to load report:', error);
    return res.status(502).json({ error: 'Failed to load report', details: error.message });
  }

  if (!report) {
    return res.status(404).json({ error: `No report found with id ${id}` });
  }

  if (!report.pdf_url || !fs.existsSync(report.pdf_url)) {
    return res.status(404).json({ error: 'PDF file not found on disk for this report' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  fs.createReadStream(report.pdf_url).pipe(res);
});

const REPORT_STATUSES = ['pending_review', 'approved', 'sent'];

app.patch('/reports/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, reviewed_by } = req.body;

  if (!REPORT_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${REPORT_STATUSES.join(', ')}` });
  }

  const { data, error } = await supabase
    .from('reports')
    .update({ status, reviewed_by, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to update report status:', error);
    return res.status(502).json({ error: 'Failed to update report status', details: error.message });
  }

  if (!data) {
    return res.status(404).json({ error: `No report found with id ${id}` });
  }

  res.status(200).json(data);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
