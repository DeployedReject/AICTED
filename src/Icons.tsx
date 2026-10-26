import type { CSSProperties } from 'react';
import aicteLogo from '../Assets/aicte-mark.svg';

type IconName = 'arrow' | 'eye' | 'eyeOff' | 'sun' | 'moon' | 'chevron' | 'lock' | 'building' | 'shield' | 'close' | 'back' | 'check' | 'mail';
const paths: Record<IconName, React.ReactNode> = {
  arrow: <><path d="M4 12h15M13 5l7 7-7 7" /></>,
  back: <><path d="M20 12H5m6-7-7 7 7 7" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="m3 3 18 18M10.6 5.1 12 5c6.5 0 10 7 10 7a21 21 0 0 1-3.1 3.9M6.3 6.3A22 22 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.7-1.5M10 10a3 3 0 0 0 4 4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  moon: <path d="M20.9 13.4A9 9 0 0 1 10.6 3.1a9 9 0 1 0 10.3 10.3Z" />,
  chevron: <path d="m7 10 5 5 5-5" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
  building: <><path d="M4 21V7l8-4 8 4v14M2 21h20M9 21v-5h6v5M8 9h1m6 0h1M8 12h1m6 0h1" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="1" /><path d="m3 6 9 7 9-7" /></>,
};

export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>{paths[name]}</svg>;
}

export function BrandMark() {
  return <img className="brand-mark" src={aicteLogo} width="46" height="48" alt="" />;
}
