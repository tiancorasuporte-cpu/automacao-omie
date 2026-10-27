import { useState } from "react";

import { cn } from "@/lib/utils";
import {
  FLEET_BRAND_LABELS,
  fleetBrandLabel,
  fleetBrandLogoUrl,
  resolveFleetBrand,
  type FleetBrandId,
} from "@/lib/fleet-brands";

type Props = {
  brand?: string | null;
  className?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  labelClassName?: string;
};

const SIZE = {
  sm: "size-7",
  md: "size-10",
  lg: "size-12",
} as const;

function BrandGlyph({ id }: { id: FleetBrandId }) {
  switch (id) {
    case "chevrolet":
      return (
        <svg viewBox="0 0 64 64" className="h-[70%] w-[70%]" aria-hidden>
          <path
            fill="#D4A017"
            d="M8 28h16l8-12 8 12h16v8H40l-8 12-8-12H8v-8z"
          />
          <path fill="#fff" d="M26 30h12v4H26z" />
        </svg>
      );
    case "fiat":
      return (
        <svg viewBox="0 0 64 64" className="h-[70%] w-[70%]" aria-hidden>
          <text
            x="32"
            y="40"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="18"
            fontWeight="800"
            letterSpacing="1.5"
            fill="#111"
          >
            FIAT
          </text>
        </svg>
      );
    case "volkswagen":
      return (
        <svg viewBox="0 0 64 64" className="h-[72%] w-[72%]" aria-hidden>
          <circle cx="32" cy="32" r="22" fill="none" stroke="#1a1a1a" strokeWidth="3.5" />
          <path
            d="M18 22 26 46h5L36 28l5 18h5L54 22h-6l-5.5 16L37 22h-5l-5.5 16L21 22h-3z"
            fill="#1a1a1a"
          />
        </svg>
      );
    case "ford":
      return (
        <svg viewBox="0 0 64 64" className="h-[70%] w-[78%]" aria-hidden>
          <ellipse cx="32" cy="32" rx="26" ry="16" fill="#003478" />
          <text
            x="32"
            y="37"
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontSize="14"
            fontStyle="italic"
            fontWeight="700"
            fill="#fff"
          >
            Ford
          </text>
        </svg>
      );
    case "toyota":
      return (
        <svg viewBox="0 0 64 64" className="h-[72%] w-[72%]" aria-hidden>
          <ellipse cx="32" cy="32" rx="22" ry="14" fill="none" stroke="#eb0a1e" strokeWidth="3" />
          <ellipse cx="32" cy="32" rx="10" ry="20" fill="none" stroke="#eb0a1e" strokeWidth="3" />
          <ellipse cx="32" cy="32" rx="4" ry="10" fill="none" stroke="#eb0a1e" strokeWidth="2.5" />
        </svg>
      );
    case "honda":
    case "honda-moto":
      return (
        <svg viewBox="0 0 64 64" className="h-[68%] w-[68%]" aria-hidden>
          <path
            fill="#e60012"
            d="M12 38c2-14 10-22 20-22s18 8 20 22c-4-10-10-15-20-15S16 28 12 38zm8 2c2-8 6-12 12-12s10 4 12 12H20z"
          />
          <path fill="#e60012" d="M28 40h8v6h-8z" />
        </svg>
      );
    case "hyundai":
      return (
        <svg viewBox="0 0 64 64" className="h-[70%] w-[70%]" aria-hidden>
          <circle cx="32" cy="32" r="22" fill="none" stroke="#002c5f" strokeWidth="3" />
          <path
            d="M18 40c4-14 10-20 14-20 3 0 5 4 5 10 0 4-1 8-2 12h5c1-4 2-8 2-12 0-8-4-14-10-14-6 0-14 8-18 24h4z"
            fill="#002c5f"
          />
        </svg>
      );
    case "renault":
      return (
        <svg viewBox="0 0 64 64" className="h-[70%] w-[70%]" aria-hidden>
          <path
            fill="#ffcc33"
            stroke="#333"
            strokeWidth="1.2"
            d="M32 8 48 32 32 56 16 32 32 8zm0 10L22 32l10 14 10-14-10-14zm0 8 5 8-5 7-5-7 5-8z"
          />
        </svg>
      );
    case "nissan":
      return (
        <svg viewBox="0 0 64 64" className="h-[72%] w-[72%]" aria-hidden>
          <circle cx="32" cy="32" r="22" fill="none" stroke="#c3002f" strokeWidth="3" />
          <rect x="14" y="28" width="36" height="8" rx="2" fill="#c3002f" />
        </svg>
      );
    case "jeep":
      return (
        <svg viewBox="0 0 64 64" className="h-[65%] w-[78%]" aria-hidden>
          <text
            x="32"
            y="38"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="16"
            fontWeight="800"
            letterSpacing="2"
            fill="#111"
          >
            JEEP
          </text>
        </svg>
      );
    case "peugeot":
      return (
        <svg viewBox="0 0 64 64" className="h-[70%] w-[70%]" aria-hidden>
          <path
            fill="#1a1a1a"
            d="M32 10c8 6 14 16 14 28 0 4-1 8-3 10-2-8-6-16-11-22v24h-2V26c-5 6-9 14-11 22-2-2-3-6-3-10 0-12 6-22 16-28z"
          />
        </svg>
      );
    case "citroen":
      return (
        <svg viewBox="0 0 64 64" className="h-[68%] w-[72%]" aria-hidden>
          <path fill="#1a1a1a" d="M8 28 32 14l24 14-4 6L32 22 12 34l-4-6zm0 14 24-14 24 14-4 6L32 36 12 48l-4-6z" />
        </svg>
      );
    case "mitsubishi":
      return (
        <svg viewBox="0 0 64 64" className="h-[70%] w-[70%]" aria-hidden>
          <path fill="#e60012" d="M32 10 42 28H22L32 10zm-14 36 10-18H8l10 18zm28 0 10-18H36l10 18z" />
        </svg>
      );
    case "chery":
      return (
        <svg viewBox="0 0 64 64" className="h-[72%] w-[72%]" aria-hidden>
          <ellipse cx="32" cy="32" rx="22" ry="16" fill="none" stroke="#1a1a1a" strokeWidth="3" />
          <path
            fill="#1a1a1a"
            d="M20 34c2-8 6-12 12-12s10 4 12 12h-5c-1-4-3-7-7-7s-6 3-7 7h-5z"
          />
        </svg>
      );
    case "bmw":
      return (
        <svg viewBox="0 0 64 64" className="h-[72%] w-[72%]" aria-hidden>
          <circle cx="32" cy="32" r="22" fill="#1a1a1a" />
          <circle cx="32" cy="32" r="16" fill="#fff" />
          <path fill="#069" d="M32 16a16 16 0 0 1 16 16H32V16z" />
          <path fill="#069" d="M32 48a16 16 0 0 1-16-16h16v16z" />
        </svg>
      );
    case "mercedes":
      return (
        <svg viewBox="0 0 64 64" className="h-[72%] w-[72%]" aria-hidden>
          <circle cx="32" cy="32" r="22" fill="none" stroke="#1a1a1a" strokeWidth="3" />
          <path fill="#1a1a1a" d="M32 12 36 36H28L32 12zm4 26 14 10-16-4 2-6zm-8 0-2 6-16 4 14-10z" />
        </svg>
      );
    case "audi":
      return (
        <svg viewBox="0 0 64 64" className="h-[55%] w-[85%]" aria-hidden>
          <g fill="none" stroke="#1a1a1a" strokeWidth="3">
            <circle cx="16" cy="32" r="10" />
            <circle cx="28" cy="32" r="10" />
            <circle cx="40" cy="32" r="10" />
            <circle cx="52" cy="32" r="10" />
          </g>
        </svg>
      );
    case "kia":
      return (
        <svg viewBox="0 0 64 64" className="h-[60%] w-[80%]" aria-hidden>
          <text
            x="32"
            y="38"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="18"
            fontWeight="800"
            fill="#05141f"
          >
            Kia
          </text>
        </svg>
      );
    case "byd":
      return (
        <svg viewBox="0 0 64 64" className="h-[60%] w-[78%]" aria-hidden>
          <text
            x="32"
            y="38"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="16"
            fontWeight="800"
            fill="#1a1a1a"
          >
            BYD
          </text>
        </svg>
      );
    case "ram":
      return (
        <svg viewBox="0 0 64 64" className="h-[60%] w-[78%]" aria-hidden>
          <text
            x="32"
            y="38"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="16"
            fontWeight="800"
            fill="#111"
          >
            RAM
          </text>
        </svg>
      );
    case "volvo":
      return (
        <svg viewBox="0 0 64 64" className="h-[72%] w-[72%]" aria-hidden>
          <circle cx="32" cy="32" r="22" fill="none" stroke="#1a1a1a" strokeWidth="3" />
          <circle cx="32" cy="18" r="3" fill="#1a1a1a" />
          <text
            x="32"
            y="38"
            textAnchor="middle"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="11"
            fontWeight="700"
            fill="#1a1a1a"
          >
            VOLVO
          </text>
        </svg>
      );
    case "yamaha":
      return (
        <svg viewBox="0 0 64 64" className="h-[70%] w-[70%]" aria-hidden>
          <circle cx="32" cy="32" r="20" fill="#e60012" />
          <path fill="#fff" d="M20 40 32 18l12 22h-7l-5-10-5 10h-7z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 64 64" className="h-[60%] w-[60%]" aria-hidden>
          <path
            fill="currentColor"
            d="M12 40 18 28h28l6 12v8h-6a6 6 0 0 1-12 0H30a6 6 0 0 1-12 0H12v-8zm8-4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm24 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM20 26l4-8h16l4 8H20z"
          />
        </svg>
      );
  }
}

export function FleetBrandMark({
  brand,
  className,
  size = "md",
  showLabel = false,
  labelClassName,
}: Props) {
  const id = resolveFleetBrand(brand);
  const label = brand?.trim() ? fleetBrandLabel(brand) : FLEET_BRAND_LABELS[id];
  const logoUrl = fleetBrandLogoUrl(brand);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImg = Boolean(logoUrl) && failedUrl !== logoUrl;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-sm", className)}>
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-outline-variant bg-white text-on-surface",
          SIZE[size],
        )}
        title={label}
      >
        {showImg ? (
          <img
            src={logoUrl!}
            alt=""
            className="h-[78%] w-[78%] object-contain"
            loading="lazy"
            decoding="async"
            onError={() => setFailedUrl(logoUrl)}
          />
        ) : (
          <BrandGlyph id={id} />
        )}
      </span>
      {showLabel ? (
        <span className={cn("truncate text-body-md text-on-surface", labelClassName)}>{label}</span>
      ) : null}
    </span>
  );
}
