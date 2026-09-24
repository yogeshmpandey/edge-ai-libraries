// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
import { MapConfigState, parseMapConfig } from './mapConfig';
import { RootState } from '../store';

export const initialState: MapConfigState = {
  cameras: {},
  loaded: false,
};

/**
 * Fetch the bind-mounted `map-config.json`, resolved against `document.baseURI`
 * so it works both at `/` (singleton UI) and under a gateway prefix like
 * `/search/` (dual UI).
 */
export const LoadMapConfig = createAsyncThunk('mapConfig/load', async () => {
  const url = new URL('map-config.json', document.baseURI).toString();
  const res = await axios.get(url);
  return parseMapConfig(res.data);
});

export const MapConfigSlice = createSlice({
  name: 'mapConfig',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(LoadMapConfig.fulfilled, (state, action) => {
        state.cameras = action.payload.cameras;
        state.loaded = true;
      })
      .addCase(LoadMapConfig.rejected, (state) => {
        // Network error or missing file: behave exactly like an empty config file.
        state.cameras = {};
        state.loaded = true;
      });
  },
});

const selectMapConfigState = (state: RootState) => state.mapConfig;

export const mapConfigSelector = createSelector([selectMapConfigState], (mapConfigState) => ({
  cameras: mapConfigState.cameras,
  loaded: mapConfigState.loaded,
  hasCameraLocations: Object.keys(mapConfigState.cameras).length > 0,
}));

export const MapConfigActions = MapConfigSlice.actions;
export const MapConfigReducer = MapConfigSlice.reducer;
