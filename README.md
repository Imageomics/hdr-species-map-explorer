# Species Map Explorer

Classroom web app for exploring species occurrence maps with open biodiversity data.

**Live demo:** [calebcharpentier.com/species-map/](https://calebcharpentier.com/species-map/)

Students can add species by scientific or common name, sample GBIF occurrence points, toggle climate and elevation overlays, browse biogeographic provinces (Udvardy), and explore taxonomic context via iNaturalist, PhyloPic silhouettes, and related links.

## Quick start

Serve the static app from `dashboard/` (any static file server works):

```bash
cd dashboard
python -m http.server 8765 --bind 127.0.0.1
```

Then open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## Classroom use

The shared live demo is usually fine for a class: each browser session runs on its own, and map data is fetched directly from GBIF / iNaturalist / other providers (not through a shared app server).

If many students load large multi-species queries at once, provider rate limits or classroom bandwidth can slow things down. In that case, teachers can run a local copy:

1. Download this repository (**Code → Download ZIP**), or clone it with git.
2. Open a terminal in the unzipped folder.
3. Run the **Quick start** commands above (needs [Python](https://www.python.org/downloads/) installed).
4. Have students open `http://127.0.0.1:8765/` on that computer, or share that machine’s local network address if your school network allows it.

Forking the repo on GitHub and enabling GitHub Pages on your fork is another option if you want a class-specific hosted URL.

## What’s included

- GBIF occurrence sampling with observation-type filters and adjustable sample size
- WorldClim / elevation / NDVI-style environment overlays
- Udvardy biogeographic provinces
- Species list tools (gallery, similar taxa, clade add, tree view)
- PhyloPic silhouettes with credit and license links

## Data sources

This app queries and displays third-party open data/services, including:

- [GBIF](https://www.gbif.org/) — occurrence records
- [iNaturalist](https://www.inaturalist.org/) — taxonomy, photos, and related taxa
- [PhyloPic](https://www.phylopic.org/) — silhouettes (credit and licenses shown in-app)
- [OpenStreetMap](https://www.openstreetmap.org/copyright) / [CARTO](https://carto.com/attribution/) — basemap tiles
- [WorldClim](https://www.worldclim.org/), [AWS Terrain](https://registry.opendata.aws/terrain-tiles/), [NASA GIBS](https://nasa-gibs.github.io/gibs-api-docs/) — climate / elevation / NDVI layers where enabled

**GBIF vs iNaturalist:** map points come from GBIF (which often already includes many iNaturalist observations). Separate iNaturalist API calls are used mainly for example photos, taxonomy browsing, and similar-taxa tools so students can see trait variation — not as a second occurrence layer. Some visual overlap between GBIF points and iNat-sourced records is expected.

Please respect each provider’s terms of use and attribution requirements when reusing outputs.

## Citation

If you use this software in research or teaching materials, please cite it. GitHub’s **Cite this repository** button reads [`CITATION.cff`](CITATION.cff).

After the first Zenodo-archived release, prefer the DOI citation from that record (and update `CITATION.cff` with the version-agnostic DOI).

## License

This project is released under the [MIT License](LICENSE).

## Acknowledgments

This work was supported by the NSF OAC 2118240 award: "HDR Institute: Imageomics: A New Frontier of Biological Information Powered by Knowledge-Guided Machine Learning." Any opinions, findings, and conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the National Science Foundation.
