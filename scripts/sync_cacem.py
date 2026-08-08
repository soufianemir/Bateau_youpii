#!/usr/bin/env python3
"""Download the current CACEM GeoPackage and keep only features near Cannes.

This job is intentionally weekly because the national GeoPackage is large. It requires
GDAL command-line tools (ogrinfo/ogr2ogr), installed by the GitHub Actions workflow.
"""
from __future__ import annotations

import json
import re
import subprocess
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
DATA.mkdir(exist_ok=True)
BBOX = (6.80, 43.45, 7.22, 43.68)
RESOURCE = "https://www.data.gouv.fr/api/1/datasets/r/dd48b545-a1d1-4710-9e56-415b895f5336"
UA = "Bateau-youpii-MVP/0.2 (+https://github.com/soufianemir/Bateau_youpii)"


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def download(url: str, target: Path):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as src, target.open("wb") as dst:
        while True:
            chunk = src.read(1024 * 1024)
            if not chunk:
                break
            dst.write(chunk)


def list_layers(gpkg: Path):
    p = subprocess.run(["ogrinfo", "-ro", "-q", str(gpkg)], check=True, text=True, capture_output=True)
    layers = []
    for line in p.stdout.splitlines():
        m = re.match(r"\s*\d+:\s+(.+?)(?:\s+\(.+\))?$", line)
        if m:
            layers.append(m.group(1).strip())
    return layers


def main():
    all_features = []
    layer_counts = {}
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        gpkg = td / "cacem.gpkg"
        download(RESOURCE, gpkg)
        for i, layer in enumerate(list_layers(gpkg)):
            out = td / f"layer-{i}.geojson"
            cmd = [
                "ogr2ogr", "-f", "GeoJSON", str(out), str(gpkg), layer,
                "-spat", *(str(x) for x in BBOX), "-t_srs", "EPSG:4326",
                "-skipfailures",
            ]
            subprocess.run(cmd, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if not out.exists():
                continue
            try:
                payload = json.loads(out.read_text(encoding="utf-8"))
            except Exception:
                continue
            features = payload.get("features", [])
            if not features:
                continue
            for feature in features:
                props = feature.setdefault("properties", {})
                props["_cacem_layer"] = layer
                keep = {k: props.get(k) for k in (
                    "id", "layer_name", "ref_reg", "source", "type", "date", "date_fin",
                    "resume", "ent_name", "facade", "validite", "tempo", "edition", "poly_name", "plan", "url"
                ) if k in props}
                keep["_cacem_layer"] = layer
                feature["properties"] = keep
                all_features.append(feature)
            layer_counts[layer] = len(features)

    output = {
        "type": "FeatureCollection",
        "features": all_features,
        "marine_meta": {
            "source": "CACEM / Ministère de la Transition écologique",
            "source_url": "https://www.data.gouv.fr/datasets/zones-reglementaires-cacem",
            "resource_url": RESOURCE,
            "generated_at": now_iso(),
            "license": "Licence Ouverte 2.0",
            "warning": "Les tracés CACEM sont une interprétation. Seuls les textes réglementaires font foi.",
            "layers": layer_counts,
        },
    }
    (DATA / "cacem-cannes.geojson").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")

    status_path = DATA / "source-status.json"
    try:
        status = json.loads(status_path.read_text(encoding="utf-8"))
    except Exception:
        status = {"generated_at": now_iso(), "sources": []}
    status["cacem"] = {"ok": True, "count": len(all_features), "updated_at": now_iso(), "layers": layer_counts}
    status_path.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"CACEM Cannes snapshot: {len(all_features)} features across {len(layer_counts)} layers")


if __name__ == "__main__":
    main()
