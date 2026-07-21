window.OVERLAY_LAYERS = [
  {
    id: "precip",
    label: "PRISM mean annual precip (in)",
    file: "overlays/prism_precip.png",
    bounds: [
      [36.9791666665635, -109.1041666665395],
      [41.0624999999295, -102.0208333331495],
    ],
    units: "inches/year",
    vmin: 8.7,
    vmax: 39.8,
    period: "1991–2020 normals",
    source_name: "PRISM Climate Group, Oregon State University",
    source_url: "https://prism.oregonstate.edu/normals/",
    files: {
      default: "overlays/prism_precip.png",
      cb: "overlays/prism_precip_cb.png",
      hc: "overlays/prism_precip_hc.png",
    },
  },
  {
    id: "tmean",
    label: "PRISM mean annual temp (°F)",
    file: "overlays/prism_tmean.png",
    bounds: [
      [36.9791666665635, -109.1041666665395],
      [41.0624999999295, -102.0208333331495],
    ],
    units: "°F",
    vmin: 32.0,
    vmax: 53.8,
    period: "1991–2020 normals",
    source_name: "PRISM Climate Group, Oregon State University",
    source_url: "https://prism.oregonstate.edu/normals/",
    files: {
      default: "overlays/prism_tmean.png",
      cb: "overlays/prism_tmean_cb.png",
      hc: "overlays/prism_tmean_hc.png",
    },
  },
];
