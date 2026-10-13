import { useMemo } from 'react';
import { faceFor as faceTraits } from '../../game/faces';
import type { Mood } from '../../game/types';

const SKIN = ['#f3d6bd', '#e8bf9a', '#d29c74', '#b07a52', '#8a5a3a', '#5e3c26'];
const HAIR = ['#24180f', '#3e2a1b', '#6b4527', '#a3733f', '#d6b878', '#8f8a84', '#9c3b1f', '#1f1f2b'];
const SHIRT = ['#2f5d50', '#9e3328', '#2f5873', '#9a6a14', '#5b4c3a', '#6d4a7a', '#3d6b6b', '#7a3f3f'];
const INK = '#2a2118';

interface Face {
  skin: string;
  hair: string;
  shirt: string;
  hairStyle: number;
  faceWidth: number;
  faceHeight: number;
  glasses: boolean;
  beard: boolean;
  eyeGap: number;
}

/** The member's face (see game/faces), in colour. */
function faceFor(seed: number): Face {
  const f = faceTraits(seed);
  return { ...f, skin: SKIN[f.skin]!, hair: HAIR[f.hair]!, shirt: SHIRT[f.shirt]! };
}

function Hair({ f, back }: { f: Face; back: boolean }) {
  const w = f.faceWidth;
  const top = 105 - f.faceHeight;
  if (back) {
    if (f.hairStyle === 1) return <path d={`M ${100 - w - 6} 100 Q ${100 - w - 10} ${top - 4} 100 ${top - 8} Q ${100 + w + 10} ${top - 4} ${100 + w + 6} 100 L ${100 + w + 8} 175 L ${100 - w - 8} 175 Z`} fill={f.hair} stroke={INK} strokeWidth={2} />;
    return null;
  }
  switch (f.hairStyle) {
    case 0: // short crop
      return <path d={`M ${100 - w} 98 Q ${100 - w - 2} ${top - 6} 100 ${top - 8} Q ${100 + w + 2} ${top - 6} ${100 + w} 98 Q ${100 + w - 8} ${top + 18} 100 ${top + 16} Q ${100 - w + 8} ${top + 18} ${100 - w} 98 Z`} fill={f.hair} stroke={INK} strokeWidth={2} />;
    case 1: // long: fringe over the back hair
      return <path d={`M ${100 - w + 2} 92 Q ${100 - w} ${top - 4} 100 ${top - 6} Q ${100 + w} ${top - 4} ${100 + w - 2} 92 Q 120 ${top + 22} 100 ${top + 20} Q 78 ${top + 26} ${100 - w + 2} 92 Z`} fill={f.hair} stroke={INK} strokeWidth={2} />;
    case 2: // bun
      return (
        <g fill={f.hair} stroke={INK} strokeWidth={2}>
          <circle cx={100} cy={top - 14} r={16} />
          <path d={`M ${100 - w} 96 Q ${100 - w} ${top - 4} 100 ${top - 4} Q ${100 + w} ${top - 4} ${100 + w} 96 Q 100 ${top + 14} ${100 - w} 96 Z`} />
        </g>
      );
    case 3: // curls
      return (
        <g fill={f.hair} stroke={INK} strokeWidth={2}>
          {Array.from({ length: 9 }, (_, i) => {
            const a = Math.PI * (1 + i / 8);
            return <circle key={i} cx={100 + Math.cos(a) * (w + 2)} cy={100 + Math.sin(a) * (f.faceHeight + 2)} r={14} />;
          })}
        </g>
      );
    case 4: // receding, just the sides
      return (
        <g fill={f.hair} stroke={INK} strokeWidth={2}>
          <path d={`M ${100 - w} 105 Q ${100 - w - 4} 80 ${100 - w + 10} 70 L ${100 - w + 12} 100 Z`} />
          <path d={`M ${100 + w} 105 Q ${100 + w + 4} 80 ${100 + w - 10} 70 L ${100 + w - 12} 100 Z`} />
        </g>
      );
    default: // side part
      return <path d={`M ${100 - w} 100 Q ${100 - w - 4} ${top - 8} 110 ${top - 8} Q ${100 + w + 4} ${top} ${100 + w} 100 Q ${100 + w - 4} ${top + 16} 84 ${top + 20} Q ${100 - w + 6} ${top + 26} ${100 - w} 100 Z`} fill={f.hair} stroke={INK} strokeWidth={2} />;
  }
}

function Expression({ f, mood }: { f: Face; mood: Mood }) {
  const gap = f.eyeGap;
  const brow = { happy: [-2, -2], neutral: [0, 0], annoyed: [3, -1], angry: [6, -3] }[mood];
  const mouth = {
    happy: 'M 86 136 Q 100 148 114 136',
    neutral: 'M 88 139 L 112 139',
    annoyed: 'M 88 141 Q 100 136 112 141',
    angry: 'M 86 143 Q 100 132 114 143',
  }[mood];
  return (
    <g stroke={INK} strokeWidth={2.2} strokeLinecap="round" fill="none">
      <line x1={100 - gap - 9} y1={88 - brow[1]!} x2={100 - gap + 8} y2={88 + brow[0]!} />
      <line x1={100 + gap + 9} y1={88 - brow[1]!} x2={100 + gap - 8} y2={88 + brow[0]!} />
      <ellipse cx={100 - gap} cy={100} rx={3.4} ry={4} fill={INK} />
      <ellipse cx={100 + gap} cy={100} rx={3.4} ry={4} fill={INK} />
      <path d="M 100 104 Q 96 118 102 120" strokeWidth={1.8} />
      <path d={mouth} />
      {mood === 'angry' && <path d="M 140 72 l 8 -6 M 144 80 l 10 -2" stroke="#9e3328" strokeWidth={2.5} />}
    </g>
  );
}

export function Portrait({ seed, mood = 'neutral', size = 200, title }: { seed: number; mood?: Mood; size?: number; title?: string }) {
  const f = useMemo(() => faceFor(seed), [seed]);
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={title ?? 'Patron'} className="portrait">
      {title && <title>{title}</title>}
      <Hair f={f} back />
      {/* shoulders and shirt */}
      <path d="M 30 200 Q 34 160 72 152 L 128 152 Q 166 160 170 200 Z" fill={f.shirt} stroke={INK} strokeWidth={2} />
      <path d="M 86 152 L 100 170 L 114 152" fill="#fbf6ea" stroke={INK} strokeWidth={2} />
      <rect x={88} y={140} width={24} height={18} fill={f.skin} stroke={INK} strokeWidth={2} />
      {/* ears and face */}
      <ellipse cx={100 - f.faceWidth} cy={104} rx={8} ry={11} fill={f.skin} stroke={INK} strokeWidth={2} />
      <ellipse cx={100 + f.faceWidth} cy={104} rx={8} ry={11} fill={f.skin} stroke={INK} strokeWidth={2} />
      <ellipse cx={100} cy={105} rx={f.faceWidth} ry={f.faceHeight * 0.62 + 18} fill={f.skin} stroke={INK} strokeWidth={2} />
      {f.beard && <path d={`M ${100 - f.faceWidth + 6} 112 Q 100 176 ${100 + f.faceWidth - 6} 112 Q 100 150 ${100 - f.faceWidth + 6} 112 Z`} fill={f.hair} stroke={INK} strokeWidth={2} />}
      <Hair f={f} back={false} />
      <Expression f={f} mood={mood} />
      {f.glasses && (
        <g stroke={INK} strokeWidth={2.4} fill="rgba(255,255,255,0.18)">
          <circle cx={100 - f.eyeGap} cy={100} r={11} />
          <circle cx={100 + f.eyeGap} cy={100} r={11} />
          <line x1={100 - f.eyeGap + 11} y1={99} x2={100 + f.eyeGap - 11} y2={99} />
        </g>
      )}
    </svg>
  );
}
