#!/usr/bin/env python3
"""Refresh lightweight official/open maritime snapshots for the Cannes MVP.

No secrets are required. Failures are isolated per provider: an unavailable source does
not erase the last known-good snapshot already committed in data/.
"""
from __future__ import annotations

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)

BBOX = (6.80, 43.45, 7.22, 43.68)  # west, south, east, north — Cannes / Antibes / Lérins
CENTER = (7.0302, 43.5484)
UA = "Bateau-youpii-MVP/0.3 (+https://github.com/soufianemir/Bateau_youpii)"

SHOM_WFS = "https://services.data.shom.fr/INSPIRE/wfs"
AVURNAV_ROOT = "https://avurnav.antoine-augusti.fr"
CDSE_STAC = "https://stac.dataspace.copernicus.eu/v1"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def request_json(url: str, *, timeout: int = 35, retries: int = 3):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return json.loads(res.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"GET failed after {retries} attempts: {url}: {last}")


def haversine_nm(lon: float, lat: float) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (CENTER[0], CENTER[1], lon, lat))
    dlon, dlat = lon2 - lon1, lat2 - lat1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 3440.065 * 2 * math.asin(math.sqrt(a))


def sync_avurnav(status: list[dict]) -> None:
    path = DATA / "avurnav.json"
    region = urllib.parse.quote("méditerranée")
    url = f"{AVURNAV_ROOT}/avurnavs/regions/{region}"
    try:
        raw = request_json(url)
        selected = []
        keywords = ("cannes", "antibes", "lérins", "lerins", "golfe-juan", "golfe juan", "nice")
        for item in raw if isinstance(raw, list) else []:
            lat, lon = item.get("latitude"), item.get("longitude")
            text = f"{item.get('title','')} {item.get('content','')}".lower()
            nearby = False
            distance = None
            if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                distance = haversine_nm(lon, lat)
                nearby = distance <= 35
            if nearby or any(k in text for k in keywords):
                selected.append({
                    "number": item.get("number"),
                    "title": item.get("title"),
                    "content": item.get("content"),
                    "latitude": lat,
                    "longitude": lon,
                    "distance_nm_from_cannes": round(distance, 1) if distance is not None else None,
                    "url": item.get("url"),
                    "valid_from": item.get("valid_from"),
                    "valid_until": item.get("valid_until"),
                    "premar_region": item.get("premar_region"),
                })
        selected.sort(key=lambda x: (x["distance_nm_from_cannes"] is None, x["distance_nm_from_cannes"] or 999))
        write_json(path, {
            "source": "AVURNAV API",
            "source_url": url,
            "generated_at": now_iso(),
            "area": "Cannes ±35 NM",
            "items": selected[:80],
        })
        status.append({"source": "AVURNAV", "ok": True, "count": len(selected), "updated_at": now_iso()})
    except Exception as exc:
        status.append({"source": "AVURNAV", "ok": False, "error": str(exc), "updated_at": now_iso()})
        print(f"AVURNAV warning: {exc}", file=sys.stderr)


def wfs_url(type_name: str) -> str:
    params = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": type_name,
        "srsName": "EPSG:4326",
        "bbox": f"{BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]},EPSG:4326",
        "outputFormat": "application/json",
    }
    return SHOM_WFS + "?" + urllib.parse.urlencode(params)


def sync_shom(status: list[dict]) -> None:
    # Only endpoints confirmed to be anonymously accessible are polled automatically.
    # The SHOM seabed-nature WFS currently answers 401 without credentials, so the MVP
    # intentionally does not pretend that layer is available. A verified open/licensed
    # substrate provider will replace data/shom-seabed.geojson later.
    layers = {
        "shom-achare.geojson": "REGLEMENTATION_NAVIGATION_BDD_WFS:achare_polygon",
        "shom-resare.geojson": "REGLEMENTATION_NAVIGATION_BDD_WFS:resare_polygon",
        "shom-fairwy.geojson": "REGLEMENTATION_NAVIGATION_BDD_WFS:fairwy_polygon",
    }
    for filename, type_name in layers.items():
        try:
            payload = request_json(wfs_url(type_name), timeout=50)
            if payload.get("type") != "FeatureCollection":
                raise ValueError("WFS response is not a GeoJSON FeatureCollection")
            payload["marine_meta"] = {
                "source": "Shom",
                "type_name": type_name,
                "generated_at": now_iso(),
                "license": "Licence Ouverte 2.0",
            }
            write_json(DATA / filename, payload)
            status.append({"source": f"SHOM {type_name.split(':')[-1]}", "ok": True, "count": len(payload.get("features", [])), "updated_at": now_iso()})
        except Exception as exc:
            status.append({"source": f"SHOM {type_name.split(':')[-1]}", "ok": False, "error": str(exc), "updated_at": now_iso()})
            print(f"SHOM warning {type_name}: {exc}", file=sys.stderr)
    status.append({
        "source": "Nature du fond",
        "ok": False,
        "skipped": True,
        "note": "Source automatique non branchée : le WFS SHOM testé exige une authentification. Aucune nature de fond n'est inventée.",
        "updated_at": now_iso(),
    })


def stac_search(collection: str, days: int = 14, limit: int = 8):
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    params = {
        "collections": collection,
        "bbox": ",".join(map(str, BBOX)),
        "datetime": f"{start.isoformat()}/{end.isoformat()}",
        "limit": str(limit),
        "sortby": "-datetime",
    }
    return request_json(f"{CDSE_STAC}/search?{urllib.parse.urlencode(params)}", timeout=45)


def compact_stac(feature: dict, sensor: str) -> dict:
    props = feature.get("properties", {})
    assets = feature.get("assets", {})
    thumbnail = None
    for key in ("thumbnail", "preview", "visual"):
        href = assets.get(key, {}).get("href") if isinstance(assets.get(key), dict) else None
        if href:
            thumbnail = href
            break
    return {
        "sensor": sensor,
        "id": feature.get("id"),
        "datetime": props.get("datetime") or props.get("start_datetime"),
        "cloud_cover": props.get("eo:cloud_cover"),
        "platform": props.get("platform"),
        "constellation": props.get("constellation"),
        "thumbnail": thumbnail,
        "catalog_url": f"{CDSE_STAC}/collections/{feature.get('collection')}/items/{feature.get('id')}" if feature.get("collection") and feature.get("id") else None,
    }


def sync_sentinel(status: list[dict]) -> None:
    out = {"source": "Copernicus Data Space STAC", "generated_at": now_iso(), "observations": []}
    collections = [("sentinel-2-l2a", "Sentinel-2 optique"), ("sentinel-1-grd", "Sentinel-1 radar")]
    for collection, sensor in collections:
        try:
            result = stac_search(collection)
            features = result.get("features", [])
            if features:
                out["observations"].append(compact_stac(features[0], sensor))
            status.append({"source": sensor, "ok": True, "count": len(features), "updated_at": now_iso()})
        except Exception as exc:
            status.append({"source": sensor, "ok": False, "error": str(exc), "updated_at": now_iso()})
            print(f"STAC warning {collection}: {exc}", file=sys.stderr)
    try:
        collections_payload = request_json(f"{CDSE_STAC}/collections")
        s3 = [c.get("id") for c in collections_payload.get("collections", []) if str(c.get("id", "")).lower().startswith("sentinel-3")]
        out["sentinel3_collections_available"] = s3[:20]
    except Exception:
        out["sentinel3_collections_available"] = []
    write_json(DATA / "sentinel-latest.json", out)


def main() -> int:
    status: list[dict] = []
    sync_avurnav(status)
    sync_shom(status)
    sync_sentinel(status)
    previous = read_json(DATA / "source-status.json", {})
    write_json(DATA / "source-status.json", {
        "generated_at": now_iso(),
        "area": {"bbox": BBOX, "label": "Cannes · Antibes · Îles de Lérins"},
        "sources": status,
        "cacem": previous.get("cacem", {"ok": False, "note": "Run the weekly CACEM workflow to refresh the clipped layer."}),
    })
    failures = [s for s in status if not s.get("ok") and not s.get("skipped")]
    print(f"Official-data sync completed: {len(status)-len(failures)} usable/skipped, {len(failures)} unavailable; last-known-good files preserved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
