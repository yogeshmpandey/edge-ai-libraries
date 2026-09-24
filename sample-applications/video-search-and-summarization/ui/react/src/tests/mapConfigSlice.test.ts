// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { configureStore } from '@reduxjs/toolkit';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidLatLon } from '../redux/mapConfig/mapConfig';
import { LoadMapConfig, MapConfigReducer, initialState, mapConfigSelector } from '../redux/mapConfig/mapConfigSlice';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

const createStore = () =>
  configureStore({
    reducer: {
      mapConfig: MapConfigReducer,
    },
  });

describe('mapConfigSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts unloaded with no cameras', () => {
    expect(initialState).toEqual({
      cameras: {},
      loaded: false,
    });
  });

  it('populates cameras and ignores non-camera fields on a successful fetch', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        unexpectedField: 'ignored',
        cameras: {
          'lobby-cam': { lat: 37.3875, lon: -121.9636, label: 'Lobby' },
        },
      },
    });

    const store = createStore();
    await store.dispatch(LoadMapConfig() as any);

    const state = mapConfigSelector({ mapConfig: store.getState().mapConfig } as any);
    expect(state.loaded).toBe(true);
    expect(state).not.toHaveProperty('unexpectedField');
    expect(state.cameras).toEqual({
      'lobby-cam': { lat: 37.3875, lon: -121.9636, label: 'Lobby' },
    });
    expect(state.hasCameraLocations).toBe(true);
  });

  it('rejects latitudes outside the Web Mercator domain', () => {
    expect(isValidLatLon(85.0511287798066, 0)).toBe(true);
    expect(isValidLatLon(-85.0511287798066, 0)).toBe(true);
    expect(isValidLatLon(86, 0)).toBe(false);
    expect(isValidLatLon(-86, 0)).toBe(false);
  });

  it('treats the nginx try_files HTML fallback as an empty config instead of throwing', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: '<!doctype html><html></html>' });

    const store = createStore();
    await store.dispatch(LoadMapConfig() as any);

    const state = mapConfigSelector({ mapConfig: store.getState().mapConfig } as any);
    expect(state.loaded).toBe(true);
    expect(state.cameras).toEqual({});
    expect(state.hasCameraLocations).toBe(false);
  });

  it('falls back to an empty config when the fetch is rejected (missing file/network error)', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('404'));

    const store = createStore();
    await store.dispatch(LoadMapConfig() as any);

    const state = mapConfigSelector({ mapConfig: store.getState().mapConfig } as any);
    expect(state.loaded).toBe(true);
    expect(state.cameras).toEqual({});
  });

  it('resolves the fetch URL against document.baseURI so it works under a gateway prefix', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: {} });

    const store = createStore();
    await store.dispatch(LoadMapConfig() as any);

    expect(mockedAxios.get).toHaveBeenCalledWith(new URL('map-config.json', document.baseURI).toString());
  });

  it('mapConfigSelector reports hasCameraLocations=false for an empty cameras map', () => {
    const state = mapConfigSelector({
      mapConfig: { cameras: {}, loaded: true },
    } as any);
    expect(state.hasCameraLocations).toBe(false);
  });
});
