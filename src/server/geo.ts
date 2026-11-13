import "@tanstack/react-start/server-only";

import type { GeoPoint } from "@/lib/geo";

export type GeocodeResult = GeoPoint & {
  source: "brasilapi_cep" | "nominatim";
  displayName?: string;
};

function digitsCep(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 8);
}

function cleanCity(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s*\([A-Za-z]{2}\)\s*$/g, "")
    .replace(/\s*\/\s*[A-Za-z]{2}\s*$/g, "")
    .trim();
}

function hasStreetHint(address: string | null | undefined) {
  const a = String(address ?? "").trim();
  if (a.length < 8) return false;
  // Rua/Av com número, ou trecho antes do bairro
  return /\d/.test(a) || /\b(rua|r\.|av\.?|avenida|travessa|alameda|estrada|rodovia)\b/i.test(a);
}

async function geocodeBrasilApiCep(cep: string): Promise<GeocodeResult | null> {
  const clean = digitsCep(cep);
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${clean}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      location?: { coordinates?: { latitude?: number | string; longitude?: number | string } };
      city?: string;
      state?: string;
    };
    const lat = Number(data.location?.coordinates?.latitude);
    const lng = Number(data.location?.coordinates?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      source: "brasilapi_cep",
      displayName: [data.city, data.state].filter(Boolean).join("/"),
    };
  } catch {
    return null;
  }
}

async function geocodeNominatim(query: string): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (q.length < 5) return null;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("addressdetails", "0");
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "AncoraAssistencia/1.0 (compras-os-roteiro)",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const hit = data[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      source: "nominatim",
      displayName: hit.display_name,
    };
  } catch {
    return null;
  }
}

function streetQuery(input: {
  address?: string | null;
  city?: string | null;
  uf?: string | null;
  cep?: string | null;
}) {
  const city = cleanCity(input.city);
  const uf = String(input.uf ?? "").trim().toUpperCase().slice(0, 2);
  const address = String(input.address ?? "").trim();
  // Preferir só a parte da rua (antes de CEP) para o Nominatim
  const street = address.split(/\s*-\s*CEP\s*/i)[0]?.trim() || address;
  return [street, city, uf, "Brasil"].filter(Boolean).join(", ");
}

/**
 * Geocodifica endereço BR.
 * Com rua/número: Nominatim primeiro (precisão de rua) → CEP como fallback.
 * Sem rua: CEP (BrasilAPI) → Nominatim genérico.
 */
export async function geocodeBrazilAddress(input: {
  address?: string | null;
  city?: string | null;
  uf?: string | null;
  cep?: string | null;
}): Promise<GeocodeResult | null> {
  const streetFirst = hasStreetHint(input.address);

  if (streetFirst) {
    const byStreet = await geocodeNominatim(streetQuery(input));
    if (byStreet) return byStreet;
  }

  const byCep = await geocodeBrasilApiCep(input.cep ?? "");
  if (byCep) return byCep;

  if (!streetFirst) {
    const byStreet = await geocodeNominatim(streetQuery(input));
    if (byStreet) return byStreet;
  }

  const city = cleanCity(input.city);
  const uf = String(input.uf ?? "").trim().toUpperCase().slice(0, 2);
  if (city) {
    return geocodeNominatim([city, uf, "Brasil"].filter(Boolean).join(", "));
  }
  return null;
}

export type { GeoPoint };
