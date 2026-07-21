/** GBIF occurrence helpers for classroom map app. */
(function () {
  const GBIF = "https://api.gbif.org/v1";

  function sleep(ms) {
    return new Promise((res) => setTimeout(res, ms));
  }

  function recordFromOccurrence(o) {
    const lat = o.decimalLatitude;
    const lon = o.decimalLongitude;
    if (lat == null || lon == null) return null;
    return {
      lat,
      lon,
      year: o.year,
      month: o.month,
      locality: o.locality || o.county || o.country || "",
      county: o.county || "",
      country: o.country || o.countryCode || "",
      scientificName: o.species || o.scientificName || "",
      gbifID: o.key,
      basisOfRecord: o.basisOfRecord || "",
      elev_m: o.elevation,
      source_url: `https://www.gbif.org/occurrence/${o.key}`,
      source_name: "GBIF occurrence",
    };
  }

  function dedupe(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const k = `${row.lat.toFixed(5)},${row.lon.toFixed(5)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async function matchSpecies(name) {
    const url = new URL(`${GBIF}/species/match`);
    url.searchParams.set("name", name);
    const r = await fetch(url);
    if (!r.ok) throw new Error("Species match failed");
    const j = await r.json();
    if (!j.usageKey) throw new Error(`No GBIF match for “${name}”`);
    return {
      scientific: j.canonicalName || j.scientificName || name,
      taxonKey: j.usageKey,
      rank: j.rank,
      status: j.status,
    };
  }

  async function fetchPage({
    taxonKey,
    country,
    stateProvince,
    yearMin,
    offset,
    limit,
  }) {
    const url = new URL(`${GBIF}/occurrence/search`);
    url.searchParams.set("taxonKey", String(taxonKey));
    url.searchParams.set("hasCoordinate", "true");
    url.searchParams.set("hasGeospatialIssue", "false");
    url.searchParams.set("occurrenceStatus", "PRESENT");
    url.searchParams.set("limit", String(Math.min(300, limit)));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("year", `${yearMin},2030`);
    if (country) url.searchParams.set("country", country);
    if (stateProvince) url.searchParams.set("stateProvince", stateProvince);

    const r = await fetch(url);
    if (!r.ok) throw new Error(`GBIF search failed (${r.status})`);
    return r.json();
  }

  async function fetchOccurrencesFlat({
    taxonKey,
    country,
    stateProvince,
    maxRecords,
    yearMin,
    onProgress,
  }) {
    const rows = [];
    let offset = 0;
    while (rows.length < maxRecords) {
      const need = maxRecords - rows.length;
      const j = await fetchPage({
        taxonKey,
        country,
        stateProvince,
        yearMin,
        offset,
        limit: need,
      });
      const results = j.results || [];
      if (!results.length) break;
      for (const o of results) {
        const rec = recordFromOccurrence(o);
        if (rec) rows.push(rec);
        if (rows.length >= maxRecords) break;
      }
      offset += results.length;
      if (onProgress) onProgress(rows.length, j.count || rows.length);
      if (offset >= (j.count || 0)) break;
      await sleep(120);
    }
    return dedupe(rows).slice(0, maxRecords);
  }

  async function countriesWithData(taxonKey, yearMin) {
    const url = new URL(`${GBIF}/occurrence/search`);
    url.searchParams.set("taxonKey", String(taxonKey));
    url.searchParams.set("hasCoordinate", "true");
    url.searchParams.set("hasGeospatialIssue", "false");
    url.searchParams.set("occurrenceStatus", "PRESENT");
    url.searchParams.set("limit", "0");
    url.searchParams.set("year", `${yearMin},2030`);
    url.searchParams.set("facet", "country");
    url.searchParams.set("facetLimit", "250");

    const r = await fetch(url);
    if (!r.ok) throw new Error(`GBIF facet failed (${r.status})`);
    const j = await r.json();
    const counts = j.facets?.find((f) => f.field === "COUNTRY")?.counts || [];
    return counts
      .filter((c) => c.count > 0)
      .map((c) => ({ country: c.name, count: c.count }))
      .sort((a, b) => b.count - a.count);
  }

  async function fetchOccurrencesStratified({
    taxonKey,
    stateProvince,
    maxRecords,
    yearMin,
    onProgress,
  }) {
    // If limited to a US state, stratification doesn't apply — flat fetch
    if (stateProvince) {
      return fetchOccurrencesFlat({
        taxonKey,
        country: "US",
        stateProvince,
        maxRecords,
        yearMin,
        onProgress,
      });
    }

    const countries = await countriesWithData(taxonKey, yearMin);
    if (!countries.length) return [];

    const perCountry = Math.max(1, Math.ceil(maxRecords / countries.length));
    const rows = [];
    let doneCountries = 0;

    for (const { country, count } of countries) {
      if (rows.length >= maxRecords) break;
      const quota = Math.min(perCountry, count, maxRecords - rows.length);
      const batch = await fetchOccurrencesFlat({
        taxonKey,
        country,
        maxRecords: quota,
        yearMin,
        onProgress: (n) => {
          if (onProgress) {
            onProgress(
              rows.length + n,
              maxRecords,
              `${country} (${doneCountries + 1}/${countries.length})`
            );
          }
        },
      });
      rows.push(...batch);
      doneCountries += 1;
      await sleep(100);
    }

    // If under max because some countries had few records, top up from the richest countries
    if (rows.length < maxRecords && countries.length) {
      const stillNeed = maxRecords - rows.length;
      const top = countries[0].country;
      const extra = await fetchOccurrencesFlat({
        taxonKey,
        country: top,
        maxRecords: stillNeed + 50,
        yearMin,
      });
      rows.push(...extra);
    }

    return dedupe(rows).slice(0, maxRecords);
  }

  async function fetchOccurrences(opts) {
    const {
      taxonKey,
      country,
      stateProvince,
      maxRecords = 1000,
      yearMin = 2000,
      stratifyByCountry = false,
      onProgress,
    } = opts;

    const capped = Math.max(1, Math.min(5000, Number(maxRecords) || 1000));

    // Regional filter already set → flat search in that place
    if (country || stateProvince) {
      return fetchOccurrencesFlat({
        taxonKey,
        country,
        stateProvince,
        maxRecords: capped,
        yearMin,
        onProgress,
      });
    }

    // Global
    if (stratifyByCountry) {
      return fetchOccurrencesStratified({
        taxonKey,
        maxRecords: capped,
        yearMin,
        onProgress,
      });
    }

    return fetchOccurrencesFlat({
      taxonKey,
      maxRecords: capped,
      yearMin,
      onProgress,
    });
  }

  window.GBIF_API = { matchSpecies, fetchOccurrences };
})();
