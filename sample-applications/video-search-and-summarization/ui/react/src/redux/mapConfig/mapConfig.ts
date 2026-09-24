// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { WEB_MERCATOR_MAX_LATITUDE } from '../../utils/webMercator';

/** A single camera's resolved location, keyed by its tag in {@link MapConfigState.cameras}. */
export interface CameraLocation {
  lat: number;
  lon: number;
  label?: string;
}

/** Shape of an individual entry as it appears in the raw `map-config.json` file. */
export interface RawCameraLocation {
  lat?: unknown;
  lon?: unknown;
  label?: unknown;
}

/** Shape of the mounted `map-config.json` file, before validation. */
export interface RawMapConfig {
  cameras?: Record<string, RawCameraLocation> | unknown;
}

export interface MapConfigState {
  /** tag -> validated location. Empty means the Map View has nothing to show. */
  cameras: Record<string, CameraLocation>;
  loaded: boolean;
}

/** Coordinates must be finite and within the Web Mercator tile-grid domain. */
export const isValidLatLon = (lat: unknown, lon: unknown): lat is number =>
  typeof lat === 'number' &&
  Number.isFinite(lat) &&
  lat >= -WEB_MERCATOR_MAX_LATITUDE &&
  lat <= WEB_MERCATOR_MAX_LATITUDE &&
  typeof lon === 'number' &&
  Number.isFinite(lon) &&
  lon >= -180 &&
  lon <= 180;

/**
 * Validate and normalize the `cameras` map from a raw config file, dropping any
 * entry with an invalid tag or coordinates and warning about each drop.
 */
export const validateCameras = (raw: unknown): Record<string, CameraLocation> => {
  const result: Record<string, CameraLocation> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }

  for (const [tag, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!tag || typeof tag !== 'string' || tag.trim().length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[mapConfig] dropping camera entry with an invalid tag', tag);
      continue;
    }

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      // eslint-disable-next-line no-console
      console.warn(`[mapConfig] dropping camera "${tag}": entry is not an object`);
      continue;
    }

    const { lat, lon, label } = entry as RawCameraLocation;
    if (!isValidLatLon(lat, lon)) {
      // eslint-disable-next-line no-console
      console.warn(`[mapConfig] dropping camera "${tag}": invalid lat/lon`, { lat, lon });
      continue;
    }

    result[tag] = {
      lat: lat as number,
      lon: lon as number,
      label: typeof label === 'string' && label.trim() ? label : tag,
    };
  }

  return result;
};

/**
 * Parse a fetched `map-config.json` body into validated state.
 *
 * Guards against the nginx `try_files` fallback: an unmounted config file
 * resolves to `index.html`, which axios may still hand back as a string or as
 * some other non-object value. Anything that is not a plain object is treated
 * as an empty config rather than thrown.
 */
export const parseMapConfig = (body: unknown): { cameras: Record<string, CameraLocation> } => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { cameras: {} };
  }

  const raw = body as RawMapConfig;
  return {
    cameras: validateCameras(raw.cameras),
  };
};
