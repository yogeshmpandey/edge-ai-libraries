// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { IconButton } from '@carbon/react';
import { Close } from '@carbon/icons-react';
import { VideoTile } from '../../redux/search/VideoTile';
import { CameraMarker } from './cameraMarkers';

export interface CameraResultsPanelProps {
  tag: string | null;
  markers: CameraMarker[];
  onClose: () => void;
}

const PanelWrapper = styled.aside`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 22rem;
  max-width: 90%;
  background: #ffffff;
  border-left: 1px solid var(--color-border, #e0e0e0);
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  display: flex;
  flex-direction: column;
  touch-action: pan-y;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border, #e0e0e0);
  font-weight: 600;
`;

const PanelBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;

  .video-tile {
    width: 100%;
    max-width: 18rem;
    margin: 0.5rem 0;
  }
`;

export const CameraResultsPanel: FC<CameraResultsPanelProps> = ({ tag, markers, onClose }) => {
  const { t } = useTranslation();
  const marker = tag ? markers.find((m) => m.tag === tag) : undefined;

  if (!marker) return null;

  return (
    <PanelWrapper
      data-testid='camera-results-panel'
      onWheel={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onPointerCancel={(event) => event.stopPropagation()}
    >
      <PanelHeader>
        <span>{t('CameraResults', 'Results for {{camera}}', { camera: marker.label })}</span>
        <IconButton kind='ghost' size='sm' label={t('CloseCameraPanel', 'Close')} onClick={onClose}>
          <Close />
        </IconButton>
      </PanelHeader>
      <PanelBody>
        {marker.resultIndices.map((resultIndex) => (
          <VideoTile key={`camera-panel-result-${resultIndex}`} resultIndex={resultIndex} showScoreDetails={false} />
        ))}
      </PanelBody>
    </PanelWrapper>
  );
};

export default CameraResultsPanel;
