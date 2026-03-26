'use client';

import React from 'react';
import { BRAND_LOGO_BASE64 } from '../utils/brand';

interface Props {
  /** Position: bottom-right (default), bottom-left, top-right, top-left */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  /** Opacity 0-1 (default 0.45) */
  opacity?: number;
  /** Width in pixels (default 100) */
  width?: number;
}

/** Small transparent neevv brand watermark overlay for canvas/image views */
const BrandWatermark: React.FC<Props> = ({
  position = 'bottom-right',
  opacity = 0.45,
  width = 100,
}) => {
  const posStyles: React.CSSProperties = {
    position: 'absolute',
    zIndex: 30,
    pointerEvents: 'none',
    opacity,
  };

  switch (position) {
    case 'bottom-right':
      posStyles.bottom = 8;
      posStyles.right = 8;
      break;
    case 'bottom-left':
      posStyles.bottom = 8;
      posStyles.left = 8;
      break;
    case 'top-right':
      posStyles.top = 8;
      posStyles.right = 8;
      break;
    case 'top-left':
      posStyles.top = 8;
      posStyles.left = 8;
      break;
  }

  return (
    <img
      src={BRAND_LOGO_BASE64}
      alt="neevv"
      style={{ ...posStyles, width, height: 'auto' }}
    />
  );
};

export default BrandWatermark;
