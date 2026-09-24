// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { FC, MouseEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState, WheelEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { IconButton } from '@carbon/react';
import { FitToScreen, ZoomIn, ZoomOut } from '@carbon/icons-react';
import {
  fitBounds,
  lonLatToScreen,
  lonLatToWorld,
  MapViewport,
  MAX_ZOOM,
  MIN_ZOOM,
  visibleTiles,
  worldToLonLat,
} from './projection';
import { CameraMarker } from './cameraMarkers';
import CameraCard from './CameraCard';
import CameraResultsPanel from './CameraResultsPanel';

export interface MapViewProps {
  markers: CameraMarker[];
  unmappedCount: number;
}

/** Pointer travel, in CSS pixels, under which a press+release counts as a click rather than a pan. */
const DRAG_THRESHOLD_PX = 4;
/** Extra screen-space margin, in pixels, kept around the viewport before a card is culled. */
const CULL_MARGIN_PX = 140;
const ZOOM_STEP = 1;
const CARD_WIDTH_PX = 160;
const CARD_ESTIMATED_HEIGHT_PX = 220;
const CARD_EDGE_PADDING_PX = 8;
const FIT_BOUNDS_PADDING_PX = CARD_WIDTH_PX / 2 + CARD_EDGE_PADDING_PX;
const INTERNAL_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const Wrapper = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 24rem;
  overflow: hidden;
  background: #dde3e8;
  touch-action: none;
`;

const TileImg = styled.img`
  position: absolute;
  user-select: none;
  pointer-events: none;
`;

const ZoomControls = styled.div`
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: flex;
  flex-direction: column;
  z-index: 3000;
  background: #ffffff;
  border-radius: 0.25rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
`;

const AttributionBar = styled.div`
  position: absolute;
  bottom: 0.25rem;
  right: 0.5rem;
  font-size: 0.6875rem;
  color: #333;
  background: rgba(255, 255, 255, 0.7);
  padding: 0 0.25rem;
  z-index: 2500;
`;

const UnmappedNotice = styled.div`
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  max-width: 60%;
  font-size: 0.75rem;
  color: #0f62fe;
  background: rgba(238, 244, 255, 0.95);
  padding: 0.375rem 0.625rem;
  border-radius: 0.25rem;
  z-index: 2500;
`;

const EmptyNotice = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #525252;
  font-style: italic;
  z-index: 2500;
`;

export const MapView: FC<MapViewProps> = ({ markers, unmappedCount }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<MapViewport | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [panelTag, setPanelTag] = useState<string | null>(null);

  const dragStateRef = useRef<{ startX: number; startY: number; startWorld: { x: number; y: number } } | null>(null);
  const wasDragRef = useRef(false);

  // Observe the actual map container. Its size can change without a window
  // resize when the surrounding search layout or sidebars change.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };

    measure();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resizeObserver?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const fitAllCameras = useCallback(() => {
    if (size.width <= 0 || size.height <= 0) return;
    const { center, zoom } = fitBounds(
      markers.map((m) => ({ lon: m.lon, lat: m.lat })),
      size.width,
      size.height,
      FIT_BOUNDS_PADDING_PX,
    );
    setView({ center, zoom, width: size.width, height: size.height });
  }, [size.width, size.height, markers]);

  // Refit automatically for a new result set or a changed container size.
  // Manual pan/zoom does not change these dependencies, so it is preserved
  // until the user requests another best fit or the inputs actually change.
  useEffect(() => {
    fitAllCameras();
  }, [fitAllCameras]);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!view) return;
      const startWorld = lonLatToWorld(view.center.lon, view.center.lat, view.zoom);
      dragStateRef.current = { startX: event.clientX, startY: event.clientY, startWorld };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [view],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragStateRef.current;
      if (!drag || !view) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      wasDragRef.current = true;
      const newWorld = { x: drag.startWorld.x - dx, y: drag.startWorld.y - dy };
      const newCenter = worldToLonLat(newWorld.x, newWorld.y, view.zoom);
      setView((prev) => (prev ? { ...prev, center: newCenter } : prev));
    },
    [view],
  );

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }, []);

  // A drag that crossed the threshold must not also register as a click on
  // whatever card it started or ended over. stopPropagation during the
  // capture phase, before the event reaches the card, keeps the card's own
  // (bubble-phase) onClick from running for that one click.
  const handleClickCapture = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (wasDragRef.current) {
      event.stopPropagation();
      wasDragRef.current = false;
    }
  }, []);

  const zoomTo = useCallback((nextZoom: number) => {
    setView((prev) => (prev ? { ...prev, zoom: Math.min(Math.max(nextZoom, MIN_ZOOM), MAX_ZOOM) } : prev));
  }, []);

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!view) return;
      event.preventDefault();

      const rect = event.currentTarget.getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;

      const cursorWorldBefore = {
        x: lonLatToWorld(view.center.lon, view.center.lat, view.zoom).x + (cursorX - view.width / 2),
        y: lonLatToWorld(view.center.lon, view.center.lat, view.zoom).y + (cursorY - view.height / 2),
      };
      const cursorLonLat = worldToLonLat(cursorWorldBefore.x, cursorWorldBefore.y, view.zoom);

      const newZoom = Math.min(Math.max(view.zoom + (event.deltaY > 0 ? -0.5 : 0.5), MIN_ZOOM), MAX_ZOOM);
      const cursorWorldAfter = lonLatToWorld(cursorLonLat.lon, cursorLonLat.lat, newZoom);
      const newCenterWorld = {
        x: cursorWorldAfter.x - (cursorX - view.width / 2),
        y: cursorWorldAfter.y - (cursorY - view.height / 2),
      };
      const newCenter = worldToLonLat(newCenterWorld.x, newCenterWorld.y, newZoom);

      setView({ ...view, zoom: newZoom, center: newCenter });
    },
    [view],
  );

  const tiles = useMemo(() => {
    if (!view) return [];
    return visibleTiles(view);
  }, [view]);

  const positionedCards = useMemo(() => {
    if (!view) return [];

    return (
      markers
        .map((marker) => {
          const screen = lonLatToScreen(marker.lon, marker.lat, view);
          const clampedCenterX = clamp(
            screen.x,
            CARD_WIDTH_PX / 2 + CARD_EDGE_PADDING_PX,
            view.width - CARD_WIDTH_PX / 2 - CARD_EDGE_PADDING_PX,
          );
          return {
            marker,
            screen,
            horizontalOffset: clampedCenterX - screen.x,
            placement:
              screen.y < CARD_ESTIMATED_HEIGHT_PX + CARD_EDGE_PADDING_PX ? ('below' as const) : ('above' as const),
          };
        })
        .filter(
          ({ screen }) =>
            screen.x >= -CULL_MARGIN_PX &&
            screen.x <= view.width + CULL_MARGIN_PX &&
            screen.y >= -CULL_MARGIN_PX &&
            screen.y <= view.height + CULL_MARGIN_PX,
        )
        // Southern (lower latitude) cards are drawn after northern ones, so they overlap on top by default.
        .sort((a, b) => b.marker.lat - a.marker.lat)
    );
  }, [markers, view]);

  const tileSourceFor = (z: number, x: number, y: number) =>
    INTERNAL_TILE_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

  return (
    <Wrapper
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClickCapture={handleClickCapture}
      onWheel={handleWheel}
      data-testid='map-view'
    >
      {view &&
        tiles.map((tile) => (
          <TileImg
            key={`${tile.z}-${tile.column}-${tile.y}`}
            src={tileSourceFor(tile.z, tile.x, tile.y)}
            alt=''
            style={{ left: tile.left, top: tile.top, width: tile.size, height: tile.size }}
            draggable={false}
          />
        ))}

      {view &&
        positionedCards.map(({ marker, screen, horizontalOffset, placement }) => (
          <CameraCard
            key={marker.tag}
            marker={marker}
            left={screen.x}
            top={screen.y}
            horizontalOffset={horizontalOffset}
            placement={placement}
            isActive={activeTag === marker.tag}
            onActivate={setActiveTag}
            onOpenPanel={setPanelTag}
          />
        ))}

      {view && markers.length === 0 && <EmptyNotice>{t('NoCameraLocations')}</EmptyNotice>}

      {unmappedCount > 0 && <UnmappedNotice>{t('UnmappedResults', { count: unmappedCount })}</UnmappedNotice>}

      <ZoomControls>
        <IconButton
          kind='ghost'
          size='sm'
          label={t('FitCameras')}
          disabled={markers.length === 0}
          onClick={fitAllCameras}
        >
          <FitToScreen />
        </IconButton>
        <IconButton kind='ghost' size='sm' label={t('ZoomIn')} onClick={() => view && zoomTo(view.zoom + ZOOM_STEP)}>
          <ZoomIn />
        </IconButton>
        <IconButton kind='ghost' size='sm' label={t('ZoomOut')} onClick={() => view && zoomTo(view.zoom - ZOOM_STEP)}>
          <ZoomOut />
        </IconButton>
      </ZoomControls>

      <AttributionBar>{t('MapAttribution')}</AttributionBar>

      <CameraResultsPanel tag={panelTag} markers={markers} onClose={() => setPanelTag(null)} />
    </Wrapper>
  );
};

export default MapView;
