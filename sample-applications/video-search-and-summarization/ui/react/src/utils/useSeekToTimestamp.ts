// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { RefObject, useEffect } from 'react';

/**
 * Seek a `<video>` element to a timestamp once its metadata has loaded, and
 * re-issue `load()` whenever the source or timestamp changes.
 *
 * Seeking only sticks once the browser has read the container metadata (the
 * duration is unknown before that), and `load()` resets `currentTime` back to
 * 0, so the seek must be driven by the `loadedmetadata` event rather than set
 * imperatively right after `load()`.
 */
export const useSeekToTimestamp = (
  videoRef: RefObject<HTMLVideoElement | null>,
  videoUrl: string | null | undefined,
  timestamp: number | null | undefined,
): void => {
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !videoUrl) return undefined;

    const seekTime = typeof timestamp === 'number' ? timestamp : 0;

    const seekToTimestamp = () => {
      if (seekTime > 0 && Number.isFinite(videoEl.duration)) {
        videoEl.currentTime = Math.min(seekTime, Math.max(videoEl.duration - 0.1, 0));
      }
    };

    videoEl.addEventListener('loadedmetadata', seekToTimestamp);
    videoEl.load();

    return () => videoEl.removeEventListener('loadedmetadata', seekToTimestamp);
  }, [videoRef, videoUrl, timestamp]);
};
