// A Lucide icon for a WMO weather code, with the moon at night.
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon,
} from 'lucide-react';
import { skyKind } from '../lib/weather';

function icon(code: number, isDay: boolean): LucideIcon {
  if (code === 45 || code === 48) {
    return CloudFog;
  }
  if (code >= 51 && code <= 57) {
    return CloudDrizzle;
  }
  switch (skyKind(code)) {
    case 'clear':
      return isDay ? Sun : Moon;
    case 'partly':
      return isDay ? CloudSun : CloudMoon;
    case 'rain':
      return CloudRain;
    case 'snow':
      return CloudSnow;
    case 'storm':
      return CloudLightning;
    default:
      return Cloud;
  }
}

interface SkyIconProps {
  code: number;
  isDay: boolean;
  size: number;
}

// Decorative: the label next to it says the same in words.
export function SkyIcon({ code, isDay, size }: SkyIconProps) {
  const Icon = icon(code, isDay);
  return <Icon size={size} strokeWidth={1.7} className="sky-icon" aria-hidden="true" />;
}
