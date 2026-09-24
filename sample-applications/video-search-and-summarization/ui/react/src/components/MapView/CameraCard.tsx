// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { FC } from 'react';
import type { MouseEvent, PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { VideoTile } from '../../redux/search/VideoTile';
import { CameraMarker } from './cameraMarkers';

export interface CameraCardProps {
  marker: CameraMarker;
  /** Anchor point the card tail points at, in container-relative CSS pixels. */
  left: number;
  top: number;
  horizontalOffset?: number;
  placement?: 'above' | 'below';
  isActive: boolean;
  onActivate: (tag: string) => void;
  onOpenPanel: (tag: string) => void;
}

const CardAnchor = styled.div<{ $left: number; $top: number; $zIndex: number }>`
  position: absolute;
  left: ${({ $left }) => $left}px;
  top: ${({ $top }) => $top}px;
  z-index: ${({ $zIndex }) => $zIndex};
  touch-action: none;
`;

const CardShell = styled.div<{ $horizontalOffset: number; $placement: 'above' | 'below' }>`
  position: absolute;
  width: 10rem;
  transform: ${({ $horizontalOffset, $placement }) =>
    `translate(calc(-50% + ${$horizontalOffset}px), ${$placement === 'above' ? 'calc(-100% - 0.5rem)' : '0.5rem'})`};
`;

const CardBody = styled.div<{ $active: boolean }>`
  position: relative;
  width: 100%;
  border-radius: 0.375rem;
  overflow: hidden;
  background: #ffffff;
  box-shadow: ${({ $active }) => ($active ? '0 4px 16px rgba(0, 0, 0, 0.35)' : '0 2px 8px rgba(0, 0, 0, 0.25)')};
  border: 2px solid ${({ $active }) => ($active ? '#0f62fe' : 'rgba(0, 0, 0, 0.15)')};
  cursor: pointer;

  .video-tile {
    width: 100%;
    margin: 0;
    border: 0;
    border-radius: 0;
  }

  .video-tile video {
    height: 5.625rem;
    object-fit: cover;
    background: #000;
  }
`;

const CardTail = styled.span<{ $horizontalOffset: number; $placement: 'above' | 'below' }>`
  position: absolute;
  left: ${({ $horizontalOffset }) => `calc(50% - ${$horizontalOffset}px)`};
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 0.5rem solid transparent;
  border-right: 0.5rem solid transparent;
  ${({ $placement }) =>
    $placement === 'above'
      ? 'top: 100%; border-top: 0.5rem solid #ffffff;'
      : 'bottom: 100%; border-bottom: 0.5rem solid #ffffff;'}
`;

const CardFooter = styled.div`
  padding: 0.375rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
`;

const CameraLabel = styled.button`
  all: unset;
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 600;
  color: #161616;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    text-decoration: underline;
  }
`;

const Coordinates = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  color: #525252;
  font-size: 0.6875rem;
  font-variant-numeric: tabular-nums;
`;

const MoreBadge = styled.span`
  align-self: flex-start;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #ffffff;
  background: #0f62fe;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.75rem;
`;

export const CameraCard: FC<CameraCardProps> = ({
  marker,
  left,
  top,
  horizontalOffset = 0,
  placement = 'above',
  isActive,
  onActivate,
  onOpenPanel,
}) => {
  const { t } = useTranslation();
  const topResultIndex = marker.resultIndices[0];
  const moreCount = marker.resultIndices.length - 1;

  const handleCardClick = () => {
    onActivate(marker.tag);
  };

  const handleLabelClick = (event: MouseEvent) => {
    event.stopPropagation();
    onOpenPanel(marker.tag);
  };

  const isolateCardPointer = (event: PointerEvent) => {
    event.stopPropagation();
  };

  return (
    <CardAnchor
      $left={left}
      $top={top}
      $zIndex={isActive ? 100000 : Math.round((90 - marker.lat) * 10) + 1}
      onMouseEnter={() => onActivate(marker.tag)}
      onPointerDown={isolateCardPointer}
      onPointerMove={isolateCardPointer}
      onPointerUp={isolateCardPointer}
      onPointerCancel={isolateCardPointer}
      data-testid={`camera-card-${marker.tag}`}
    >
      <CardShell $horizontalOffset={horizontalOffset} $placement={placement}>
        <CardBody $active={isActive} onClick={handleCardClick}>
          {topResultIndex !== undefined && (
            <VideoTile resultIndex={topResultIndex} showScoreDetails={false}>
              <CardFooter>
                <CameraLabel type='button' onClick={handleLabelClick} title={marker.label}>
                  {marker.label}
                </CameraLabel>
                <Coordinates>
                  <span>Lat: {marker.lat.toFixed(5)}</span>
                  <span>Lon: {marker.lon.toFixed(5)}</span>
                </Coordinates>
                {moreCount > 0 && <MoreBadge>{t('MoreResults', '+{{count}} more', { count: moreCount })}</MoreBadge>}
              </CardFooter>
            </VideoTile>
          )}
        </CardBody>
        <CardTail $horizontalOffset={horizontalOffset} $placement={placement} aria-hidden='true' />
      </CardShell>
    </CardAnchor>
  );
};

export default CameraCard;
