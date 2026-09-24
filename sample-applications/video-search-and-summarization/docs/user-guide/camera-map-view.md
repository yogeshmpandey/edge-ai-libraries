<!--
SPDX-FileCopyrightText: (C) 2026 Intel Corporation
SPDX-License-Identifier: Apache-2.0
-->

# Camera Map View

## Overview

The Map View plots video search results on a Web Mercator map, pinned at the
geographic location of the camera that produced each result. It is a third
results view alongside the flat **Results** list and **Group by Tag**, available
only from **Search** (and **Combined Search and Summarization**) deployments.

The view is driven entirely by a single runtime configuration file,
`map-config.json`, that maps each camera's search **tag** to a latitude/longitude
(and an optional display label). No image rebuild and no new environment
variable are required to configure, add, or update cameras — edit the mounted
file (Docker Compose) or the Helm values (Kubernetes) and reload the page.

## How It Works

- The **Map View** button appears in the results header only when
  `map-config.json` resolves to at least one valid camera location. If the file
  is missing, empty (`{}`), or every entry fails validation, the button is
  hidden and results still render in the existing **Results** / **Group by Tag**
  views.
- Each search result's tags (however they were produced — CSV metadata, an
  embedded tags array, or a tag attached by Pipeline Manager) are matched
  against the configured camera tags. A result can appear on more than one pin
  if it carries more than one mapped tag.
- Each camera pin renders the standard search-result video tile for its
  best-scoring match, with native playback controls plus the configured camera
  label and coordinates. The "+N more" badge is informational; select the
  camera label to open the side panel with all matches for that camera.
- Panning and zooming are hand-rolled (no third-party map library is bundled).
  The UI uses its internal OpenStreetMap raster basemap and automatically fits
  all mapped cameras into the available viewport.
  Search results whose tags do not match any configured camera are counted and
  called out in an "unmapped results" notice, so they are never silently dropped.

## Configuring Camera Locations

### `map-config.json` schema

The file carries only camera locations:

```json
{
  "cameras": {
    "lobby-cam": { "lat": 37.3875, "lon": -121.9636, "label": "Lobby Camera" },
    "dock-cam": { "lat": 47.6062, "lon": -122.3321, "label": "Loading Dock" }
  }
}
```

| Field                 | Required              | Notes                                                                                                                                            |
| --------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cameras`             | No (defaults to none) | A map of **tag → location**. The key must match a video's search tag exactly.                                                                    |
| `cameras.<tag>.lat`   | Yes, per camera       | Finite number in the Web Mercator range `[-85.05112878, 85.05112878]`. Invalid entries are dropped with a warning; other cameras are unaffected. |
| `cameras.<tag>.lon`   | Yes, per camera       | Finite number in `[-180, 180]`.                                                                                                                  |
| `cameras.<tag>.label` | No                    | Display label on the map/side panel. Defaults to the tag itself.                                                                                 |

An empty file (`{}`) or a file with no valid camera entries is a supported,
default state: it simply hides the Map View button. The raster tile source is
an internal UI implementation detail and is not accepted from this file.

### Docker Compose

`docker/compose.ui.yaml` bind-mounts `config/map-config.json` read-only into
every UI container (`vss-summary-ui`, `vss-search-ui`, `vss-singleton-ui`) at
the path the built UI serves it from. Edit the file and restart (or just
reload the page — no rebuild is required):

```bash
# from the repository root
$EDITOR config/map-config.json
source setup.sh --search   # or --summary --search / --summary-and-search
```

To use a config file from a different path, set `MAP_CONFIG_FILE` before
starting:

```bash
export MAP_CONFIG_FILE=/path/to/your/map-config.json
```

### Helm

The `vss-ui` chart renders `map-config.json` from Helm values into a ConfigMap
and mounts it the same way as the Compose file. Set cameras under the UI
release's `mapConfig` key — for example, in `summary_override.yaml`'s
`summaryui:` block or `search_override.yaml`'s `searchui:` block:

```yaml
summaryui:
  mapConfig:
    cameras:
      lobby-cam:
        lat: 37.3875
        lon: -121.9636
        label: "Lobby Camera"
```

Apply the change with `helm upgrade`; the chart hashes the rendered config into
the pod template so the UI pod restarts automatically on a config-only change.

### Development (`vite dev`)

Running the UI directly with `vite` (outside Docker) serves the same
`config/map-config.json` at `/map-config.json` through a dev-only Vite plugin,
so local development matches the deployed behavior without any extra setup.

## Dev/Deployment Parity Checklist

The same `config/map-config.json` file is used by three delivery paths, all of
which must be updated in lockstep if you customize the mount location:

| Delivery path                 | Where it's wired                                                             |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `vite dev` (local, no Docker) | `ui/react/vite.config.ts` (`vss-map-config-dev` plugin)                      |
| Docker Compose                | `docker/compose.ui.yaml` (`MAP_CONFIG_FILE` volume mount)                    |
| Kubernetes / Helm             | `chart/subchart/vss-ui/values.yaml` (`mapConfig`) and its ConfigMap template |
