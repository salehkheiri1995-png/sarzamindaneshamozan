import React from 'react';
import { SHOP_ITEMS } from '../../shared/curriculum';

interface HeroAvatarSvgProps {
  heroClass: string;
  equippedOutfit: string;
  equippedPet?: string;
  avatarColor?: string;
  size?: number;
  className?: string;
}

export function HeroAvatarSvg({
  heroClass,
  equippedOutfit,
  equippedPet = 'none',
  avatarColor = '#D97706',
  size = 96,
  className = '',
}: HeroAvatarSvgProps) {
  const outfitItem = SHOP_ITEMS.find((i) => i.id === equippedOutfit);
  const cloakColor = outfitItem?.swatch || avatarColor || '#D97706';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="تصویر شخصیت قهرمان"
    >
      {/* Background medallion */}
      <circle cx="60" cy="60" r="54" fill="#FEF3C7" stroke="#92400E" strokeWidth="3" />
      <circle cx="60" cy="60" r="48" fill="#FFFBEB" stroke={cloakColor} strokeWidth="2" strokeDasharray="4 4" />

      {/* Hero Cloak / Body */}
      <path
        d="M32 98C34 74 44 66 60 66C76 66 86 74 88 98"
        fill={cloakColor}
        stroke="#292524"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Golden Sash */}
      <path
        d="M46 72L60 84L74 72"
        stroke="#FDE68A"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="84" r="5" fill="#F59E0B" stroke="#292524" strokeWidth="2" />

      {/* Head */}
      <circle cx="60" cy="46" r="19" fill="#FDE2C4" stroke="#292524" strokeWidth="2.8" />

      {/* Hair / Class Headgear */}
      {heroClass === 'explorer' && (
        <path
          d="M36 42C38 27 82 27 84 42L88 44H32L36 42Z"
          fill="#92400E"
          stroke="#292524"
          strokeWidth="2.5"
        />
      )}
      {heroClass === 'scholar' && (
        <g>
          <path d="M40 38C44 24 76 24 80 38" fill="#1E293B" stroke="#292524" strokeWidth="2.5" />
          <polygon points="60,20 82,30 60,38 38,30" fill="#059669" stroke="#292524" strokeWidth="2.2" />
        </g>
      )}
      {heroClass === 'inventor' && (
        <g>
          <path d="M41 40C43 26 77 26 79 40" fill="#44403C" stroke="#292524" strokeWidth="2.5" />
          <circle cx="51" cy="34" r="5.5" fill="#99F6E4" stroke="#292524" strokeWidth="2.2" />
          <circle cx="69" cy="34" r="5.5" fill="#99F6E4" stroke="#292524" strokeWidth="2.2" />
          <line x1="56.5" y1="34" x2="63.5" y2="34" stroke="#292524" strokeWidth="2.2" />
        </g>
      )}
      {heroClass === 'guardian' && (
        <path
          d="M42 38L50 24L60 31L70 24L78 38Z"
          fill="#F59E0B"
          stroke="#292524"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      )}

      {/* Friendly Eyes & Smile */}
      <circle cx="53" cy="48" r="2.6" fill="#1C1917" />
      <circle cx="67" cy="48" r="2.6" fill="#1C1917" />
      <circle cx="48" cy="53" r="3" fill="#FCA5A5" opacity="0.55" />
      <circle cx="72" cy="53" r="3" fill="#FCA5A5" opacity="0.55" />
      <path d="M54 55C57 59 63 59 66 55" stroke="#1C1917" strokeWidth="2.4" strokeLinecap="round" />

      {/* Companion Pet Badge (Bottom Left) */}
      {equippedPet !== 'none' && (
        <g transform="translate(80, 74)">
          <circle cx="16" cy="16" r="15" fill="#FFFBEB" stroke="#292524" strokeWidth="2.4" />
          {equippedPet === 'pet_owl' && (
            <g>
              <ellipse cx="16" cy="18" rx="8" ry="9" fill="#92400E" />
              <circle cx="13" cy="15" r="2.8" fill="#FFF" />
              <circle cx="19" cy="15" r="2.8" fill="#FFF" />
              <circle cx="13" cy="15" r="1.2" fill="#1C1917" />
              <circle cx="19" cy="15" r="1.2" fill="#1C1917" />
              <polygon points="16,17 14,20 18,20" fill="#F59E0B" />
            </g>
          )}
          {equippedPet === 'pet_deer' && (
            <g>
              <circle cx="16" cy="19" r="7" fill="#B45309" />
              <path d="M12 13L9 8M20 13L23 8" stroke="#78350F" strokeWidth="2" strokeLinecap="round" />
              <circle cx="13.5" cy="18" r="1.3" fill="#1C1917" />
              <circle cx="18.5" cy="18" r="1.3" fill="#1C1917" />
            </g>
          )}
          {equippedPet === 'pet_fox' && (
            <g>
              <polygon points="16,26 8,14 24,14" fill="#EA580C" />
              <polygon points="9,14 11,8 15,14" fill="#EA580C" />
              <polygon points="23,14 21,8 17,14" fill="#EA580C" />
              <circle cx="13.5" cy="17" r="1.3" fill="#1C1917" />
              <circle cx="18.5" cy="17" r="1.3" fill="#1C1917" />
            </g>
          )}
        </g>
      )}
    </svg>
  );
}
