/** Helpers de distância/região (seguros no client e no server). */

export type GeoPoint = { lat: number; lng: number };

export type CompanyLocation = {
  label: string;
  address: string;
  city: string;
  uf: string;
  cep: string;
  lat: number | null;
  lng: number | null;
};

export const EMPTY_COMPANY_LOCATION: CompanyLocation = {
  label: "Base Âncora",
  address: "",
  city: "",
  uf: "",
  cep: "",
  lat: null,
  lng: null,
};

const EARTH_KM = 6371;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistanceKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return "—";
  if (km < 0.05) return `${Math.max(0, Math.round(km * 1000))} m`;
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  if (km < 10) return `${km.toFixed(1).replace(".", ",")} km`;
  return `${Math.round(km)} km`;
}

export function cleanCityName(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s*\([A-Za-z]{2}\)\s*$/g, "")
    .replace(/\s*\/\s*[A-Za-z]{2}\s*$/g, "")
    .trim();
}

export function buildRegionLabel(input: {
  city?: string | null;
  uf?: string | null;
}): string {
  const city = cleanCityName(input.city);
  const uf = (input.uf ?? "").trim().toUpperCase().slice(0, 2);
  if (city && uf) {
    // evita "Monte Alto/SP/SP" se a cidade já trouxe UF
    if (city.toUpperCase().endsWith(`/${uf}`)) return city;
    return `${city}/${uf}`;
  }
  if (city) return city;
  if (uf) return uf;
  return "Sem região";
}

export function parseCompanyLocation(raw: string | null | undefined): CompanyLocation {
  if (!raw?.trim()) return { ...EMPTY_COMPANY_LOCATION };
  try {
    const parsed = JSON.parse(raw) as Partial<CompanyLocation>;
    const lat = parsed.lat == null ? null : Number(parsed.lat);
    const lng = parsed.lng == null ? null : Number(parsed.lng);
    return {
      label: String(parsed.label ?? EMPTY_COMPANY_LOCATION.label).trim() || EMPTY_COMPANY_LOCATION.label,
      address: String(parsed.address ?? "").trim(),
      city: String(parsed.city ?? "").trim(),
      uf: String(parsed.uf ?? "").trim().toUpperCase().slice(0, 2),
      cep: String(parsed.cep ?? "").replace(/\D/g, "").slice(0, 8),
      lat: lat != null && Number.isFinite(lat) ? lat : null,
      lng: lng != null && Number.isFinite(lng) ? lng : null,
    };
  } catch {
    return { ...EMPTY_COMPANY_LOCATION };
  }
}

export function companyHasCoords(loc: CompanyLocation | null | undefined): loc is CompanyLocation & {
  lat: number;
  lng: number;
} {
  return Boolean(
    loc &&
      loc.lat != null &&
      loc.lng != null &&
      Number.isFinite(loc.lat) &&
      Number.isFinite(loc.lng),
  );
}
