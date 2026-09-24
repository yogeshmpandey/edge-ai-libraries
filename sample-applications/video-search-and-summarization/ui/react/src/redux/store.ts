// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

import notificationReducer from './notification/notificationSlice.ts';
import { SummaryReducers } from './summary/summarySlice.ts';
import { VideoChunkReducer } from './summary/videoChunkSlice.ts';
import { VideoFrameReducer } from './summary/videoFrameSlice.ts';
import { UIReducer } from './ui/ui.slice.ts';
import { VideoReducers } from './video/videoSlice.ts';
import { SearchReducers } from './search/searchSlice.ts';
import { MapConfigReducer } from './mapConfig/mapConfigSlice.ts';

export const loadFromLocalStorage = () => {
  try {
    const serialisedState = localStorage.getItem('reduxStore');
    if (serialisedState === null) return undefined;
    const state = JSON.parse(serialisedState);
    delete state.ui;
    // The whole store is persisted to localStorage. A stale persisted copy of
    // mapConfig would shadow an operator's edited map-config.json on reload,
    // defeating the point of that file being runtime-editable.
    delete state.mapConfig;
    return state;
  } catch (err) {
    console.warn(err);
    return undefined;
  }
};

export const saveToLocalStorage = (state: ReturnType<typeof store.getState>) => {
  try {
    const serialState = JSON.stringify(state);
    localStorage.setItem('reduxStore', serialState);
  } catch (e) {
    console.warn(e);
  }
};

export const rootReducer = combineReducers({
  // conversations: conversationReducer,
  videoChunks: VideoChunkReducer,
  videoFrames: VideoFrameReducer,
  videos: VideoReducers,
  notifications: notificationReducer,
  summaries: SummaryReducers,
  search: SearchReducers,
  ui: UIReducer,
  mapConfig: MapConfigReducer,
});

const store = configureStore({
  reducer: rootReducer,
  devTools: import.meta.env.PROD || true,
  preloadedState: loadFromLocalStorage(),
  middleware: (getDefaultMiddleware) => getDefaultMiddleware(),
});

store.subscribe(() => saveToLocalStorage(store.getState()));

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
