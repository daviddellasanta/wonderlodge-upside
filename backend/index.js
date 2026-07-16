require('dotenv').config();

const express = require('express');
const supabase = require('./src/supabaseClient');
const { fetchMarketComp } = require('./src/pricelabsClient');

const app = express();
app.use(express.json());

app.post('/sync/market-benchmarks', async (req, res) => {
  const { region, period_start, period_end } = req.body;

  if (!region || !period_start || !period_end) {
    return res.status(400).json({ error: 'region, period_start, and period_end are required' });
  }

  try {
    const comp = await fetchMarketComp(region, period_start, period_end);

    const { data, error } = await supabase
      .from('market_benchmarks')
      .insert({
        region,
        period_start,
        period_end,
        occupancy_pct: comp.occupancy_pct,
        adr: comp.adr,
        revpar: comp.revpar,
        source: 'pricelabs',
        raw_data: comp,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(data);
  } catch (err) {
    console.error('Failed to sync market benchmarks:', err);
    res.status(502).json({ error: 'Failed to sync market benchmarks', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
