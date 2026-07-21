"""
Re-render WorldClim precip/temp PNG overlays for the dashboard.

Expects (in dashboard/_tmp_wc/):
  - wc2.1_5m_bio_1.tif, wc2.1_5m_bio_12.tif
  - ne_10m_land.shp (+ sidecars)

Writes dashboard/overlays/wc_*.png and updates overlays.js / overlays/layers.json.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import rasterio
import shapefile
from PIL import Image, ImageFilter
from pyproj import Transformer
from rasterio import features as rio_features
from rasterio.crs import CRS
from rasterio.transform import array_bounds
from rasterio.warp import Resampling, calculate_default_transform, reproject
from shapely.geometry import mapping, shape
from shapely.ops import transform as shp_transform

ROOT = Path(__file__).resolve().parents[1]
TMP = ROOT / "_tmp_wc"
OUT = ROOT / "overlays"
DST_CRS = CRS.from_epsg(3857)
MAX_WIDTH = 6144

RAMPS = {
    "precip": {
        "default": ["#d2b48c", "#e6d296", "#8cbe78", "#3c8ca0", "#14468c"],
        "cb": ["#00224e", "#465b7a", "#6e7f6d", "#a69450", "#ffe696"],
        "hc": ["#140a32", "#502878", "#b45028", "#e6a014", "#fff050"],
    },
    "tmean": {
        "default": ["#2850a0", "#78b4c8", "#f0e696", "#e68c3c", "#b4281e"],
        "cb": ["#00224e", "#465b7a", "#6e7f6d", "#a69450", "#ffe696"],
        "hc": ["#140a32", "#502878", "#b45028", "#e6a014", "#fff050"],
    },
}

P_LO, P_HI = 10.0, 2000.0
LOG_LO, LOG_HI = np.log10(P_LO), np.log10(P_HI)
T_VMIN, T_VMAX = -20.0, 30.0


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def load_land_geoms_mercator():
    to_3857 = Transformer.from_crs(4326, 3857, always_xy=True).transform
    sf = shapefile.Reader(str(TMP / "ne_10m_land.shp"))
    geoms = []
    for sr in sf.iterShapeRecords():
        g = shape(sr.shape.__geo_interface__)
        if g.is_empty:
            continue
        gm = shp_transform(to_3857, g)
        if not gm.is_empty:
            geoms.append(mapping(gm))
    return geoms


def mercator_grid(src):
    left, bottom, right, top = src.bounds
    bottom = max(bottom, -85.05112878)
    top = min(top, 85.05112878)
    transform, width, height = calculate_default_transform(
        src.crs, DST_CRS, src.width, src.height, left, bottom, right, top
    )
    if width > MAX_WIDTH:
        scale = MAX_WIDTH / width
        width = MAX_WIDTH
        height = max(1, int(round(height * scale)))
        transform = rasterio.Affine(
            transform.a / scale,
            transform.b,
            transform.c,
            transform.d,
            transform.e / scale,
            transform.f,
        )
    return transform, width, height


def soft_alpha(land_mask: np.ndarray, radius: float = 1.2) -> np.ndarray:
    base = land_mask.astype(np.uint8) * 255
    img = Image.fromarray(base, mode="L").filter(ImageFilter.GaussianBlur(radius=radius))
    a = np.asarray(img).astype(np.float32) / 255.0
    out = np.clip(a * 220, 0, 220).astype(np.uint8)
    near = np.asarray(Image.fromarray(base, mode="L").filter(ImageFilter.MaxFilter(size=3))) > 0
    out[~near] = 0
    return out


def colorize(values, vmin, vmax, colors, land_mask, log=False):
    stops = np.array([hex_to_rgb(c) for c in colors], dtype=np.float32)
    n = len(stops) - 1
    if log:
        safe = np.where(~land_mask | ~np.isfinite(values) | (values <= 0), P_LO, values)
        logv = np.log10(np.clip(safe, P_LO, P_HI))
        t = np.clip((logv - LOG_LO) / (LOG_HI - LOG_LO + 1e-9), 0, 1)
    else:
        safe = np.where(~land_mask | ~np.isfinite(values), vmin, values)
        t = np.clip((safe - vmin) / (vmax - vmin + 1e-9), 0, 1)
    idx = t * n
    i0 = np.clip(np.floor(idx).astype(np.int32), 0, n)
    i1 = np.clip(i0 + 1, 0, n)
    f = (idx - i0)[..., None]
    rgb = stops[i0] * (1 - f) + stops[i1] * f
    rgba = np.zeros(values.shape + (4,), dtype=np.uint8)
    rgba[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    rgba[..., 3] = soft_alpha(land_mask)
    rgba[rgba[..., 3] == 0, :3] = 0
    return rgba


def main():
    OUT.mkdir(exist_ok=True)
    to_ll = Transformer.from_crs(3857, 4326, always_xy=True)
    land_geoms = load_land_geoms_mercator()

    with rasterio.open(TMP / "wc2.1_5m_bio_1.tif") as src:
        transform, width, height = mercator_grid(src)

    land = (
        rio_features.rasterize(
            ((g, 1) for g in land_geoms),
            out_shape=(height, width),
            transform=transform,
            fill=0,
            dtype=np.uint8,
        )
        > 0
    )

    metas = {}
    for kind, tif, log, vmin, vmax, label, units in [
        ("tmean", "wc2.1_5m_bio_1.tif", False, T_VMIN, T_VMAX, "WorldClim mean annual temp (°C)", "°C"),
        ("precip", "wc2.1_5m_bio_12.tif", True, P_LO, P_HI, "WorldClim mean annual precip (mm)", "mm/year"),
    ]:
        with rasterio.open(TMP / tif) as src:
            arr = np.full((height, width), np.nan, dtype=np.float32)
            reproject(
                source=rasterio.band(src, 1),
                destination=arr,
                src_transform=src.transform,
                src_crs=src.crs,
                src_nodata=src.nodata,
                dst_transform=transform,
                dst_crs=DST_CRS,
                dst_nodata=np.nan,
                resampling=Resampling.bilinear,
            )
            west, south, east, north = array_bounds(height, width, transform)
            sw = to_ll.transform(west, south)
            ne = to_ll.transform(east, north)
            bounds = [[sw[1], sw[0]], [ne[1], ne[0]]]

        show = land & np.isfinite(arr) & (arr > -1000)
        meta = {
            "id": f"wc_{kind}",
            "label": label,
            "file": f"overlays/wc_{kind}.png",
            "bounds": bounds,
            "units": units,
            "vmin": vmin,
            "vmax": vmax,
            "period": "1970–2000 normals",
            "source_name": "WorldClim 2.1",
            "source_url": "https://www.worldclim.org/",
            "global": True,
            "files": {},
        }
        for theme, colors in RAMPS[kind].items():
            rgba = colorize(arr, vmin, vmax, colors, show, log=log)
            suffix = "" if theme == "default" else f"_{theme}"
            fname = f"wc_{kind}{suffix}.png"
            Image.fromarray(rgba, "RGBA").save(OUT / fname, optimize=True)
            meta["files"]["default" if theme == "default" else theme] = f"overlays/{fname}"
        metas[kind] = meta

    layers_out = [metas["precip"], metas["tmean"]]
    (ROOT / "overlays.js").write_text(
        "window.OVERLAY_LAYERS = " + json.dumps(layers_out, indent=2) + ";\n",
        encoding="utf-8",
    )
    (OUT / "layers.json").write_text(json.dumps(layers_out, indent=2), encoding="utf-8")
    print("updated overlays")


if __name__ == "__main__":
    main()
