import "@tanstack/react-start/server-only";

import type { GeoPoint } from "@/lib/geo";

export type GeocodeResult = GeoPoint & {
  source: "nominatim" | "photon" | "brasilapi_cep";
  displayName?: string;
  precision: "street" | "neighborhood" | "city" | "cep";
};

const UF_STATE: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
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

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** R / AV / AL → forma completa (Omie costuma abreviar). */
function expandStreetName(value: string) {
  let s = value.trim().replace(/\s+/g, " ");
  s = s.replace(
    /^(R|RUA|AV|AVENIDA|AL|ALAMEDA|TV|TRAVESSA|EST|ESTRADA|ROD|RODOVIA|PC|PRACA|LG|LARGO)\.?\s+/i,
    (_, p1: string) => {
      const key = stripAccents(String(p1).replace(/\./g, "")).toUpperCase();
      const map: Record<string, string> = {
        R: "Rua ",
        RUA: "Rua ",
        AV: "Avenida ",
        AVENIDA: "Avenida ",
        AL: "Alameda ",
        ALAMEDA: "Alameda ",
        TV: "Travessa ",
        TRAVESSA: "Travessa ",
        EST: "Estrada ",
        ESTRADA: "Estrada ",
        ROD: "Rodovia ",
        RODOVIA: "Rodovia ",
        PC: "Praca ",
        PRACA: "Praca ",
        LG: "Largo ",
        LARGO: "Largo ",
      };
      return map[key] ?? `${p1} `;
    },
  );
  return s.trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type AddressParts = {
  street: string;
  streetName: string;
  houseNumber: string;
  neighborhood: string;
  city: string;
  uf: string;
  cep: string;
  stateName: string;
};

/** Quebra endereço Omie: "RUA X, 70 - BAIRRO - CIDADE (SP) - CEP 00000-000" */
export function parseBrazilAddressParts(input: {
  address?: string | null;
  city?: string | null;
  uf?: string | null;
  cep?: string | null;
}): AddressParts {
  const raw = String(input.address ?? "").trim();
  const chunks = raw
    .split(/\s*-\s*/)
    .map((c) => c.trim())
    .filter(Boolean);

  let street = "";
  let neighborhood = "";
  let city = cleanCity(input.city);
  let uf = String(input.uf ?? "").trim().toUpperCase().slice(0, 2);
  let cep = digitsCep(input.cep);

  for (const chunk of chunks) {
    const cepMatch = chunk.match(/^CEP\s*(\d{5}-?\d{3})$/i);
    if (cepMatch) {
      cep = digitsCep(cepMatch[1]);
      continue;
    }
    const cidadeUf = chunk.match(/^(.+?)\s*\/\s*([A-Za-z]{2})$/);
    const cidadeParen = chunk.match(/^(.+?)\s*\(([A-Za-z]{2})\)$/);
    if (cidadeUf) {
      city = cleanCity(cidadeUf[1]);
      uf = cidadeUf[2]!.toUpperCase();
      continue;
    }
    if (cidadeParen) {
      city = cleanCity(cidadeParen[1]);
      uf = cidadeParen[2]!.toUpperCase();
      continue;
    }
    if (!street) {
      street = chunk;
      continue;
    }
    if (!neighborhood && !/^\d+$/.test(chunk)) {
      neighborhood = chunk;
    }
  }

  if (!street && raw) street = raw.split(/\s*-\s*CEP\s*/i)[0]?.trim() || raw;
  if (!city) city = cleanCity(input.city);

  street = expandStreetName(street);
  const numMatch = street.match(/^(.*?)[,\s]+(\d+[A-Za-z]?)\s*$/);
  const streetName = expandStreetName((numMatch?.[1] ?? street).trim());
  const houseNumber = (numMatch?.[2] ?? "").trim();

  return {
    street: street.trim(),
    streetName,
    houseNumber,
    neighborhood,
    city,
    uf,
    cep,
    stateName: UF_STATE[uf] ?? uf,
  };
}

function isCityLevelHit(hit: {
  class?: string;
  type?: string;
  addresstype?: string;
}) {
  const kind = `${hit.class ?? ""} ${hit.type ?? ""} ${hit.addresstype ?? ""}`.toLowerCase();
  return (
    /\b(city|town|municipality|county|state|administrative|boundary|region)\b/.test(kind) ||
    hit.class === "boundary" ||
    (hit.class === "place" &&
      ["city", "town", "municipality", "state", "county"].includes(String(hit.type ?? "")))
  );
}

type BrasilApiCepDetails = {
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
};

async function lookupBrasilApiCep(cep: string): Promise<BrasilApiCepDetails | null> {
  const clean = digitsCep(cep);
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${clean}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      street?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      location?: { coordinates?: { latitude?: number | string; longitude?: number | string } };
    };
    const lat = Number(data.location?.coordinates?.latitude);
    const lng = Number(data.location?.coordinates?.longitude);
    return {
      street: data.street?.trim() || null,
      neighborhood: data.neighborhood?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim().toUpperCase().slice(0, 2) || null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    };
  } catch {
    return null;
  }
}

async function geocodeNominatimParams(
  params: Record<string, string>,
  opts?: { rejectCityLevel?: boolean },
): Promise<GeocodeResult | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    for (const [k, v] of Object.entries(params)) {
      if (v.trim()) url.searchParams.set(k, v.trim());
    }
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "5");
    url.searchParams.set("countrycodes", "br");
    url.searchParams.set("addressdetails", "1");
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "AncoraAssistencia/1.0 (os-roteiro-distancia)",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      class?: string;
      type?: string;
      addresstype?: string;
    }>;
    for (const hit of data) {
      if (opts?.rejectCityLevel && isCityLevelHit(hit)) continue;
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      return {
        lat,
        lng,
        source: "nominatim",
        precision: opts?.rejectCityLevel ? "street" : "city",
        displayName: hit.display_name,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function geocodePhoton(query: string, near?: GeoPoint | null): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (q.length < 5) return null;
  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "8");
    url.searchParams.set("lang", "pt");
    if (near) {
      url.searchParams.set("lat", String(near.lat));
      url.searchParams.set("lon", String(near.lng));
    }
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: {
          name?: string;
          street?: string;
          housenumber?: string;
          city?: string;
          state?: string;
          type?: string;
          osm_key?: string;
          osm_value?: string;
        };
      }>;
    };
    for (const feat of data.features ?? []) {
      const coords = feat.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const p = feat.properties ?? {};
      const kind = `${p.type ?? ""} ${p.osm_key ?? ""} ${p.osm_value ?? ""}`.toLowerCase();
      const cityLevel = /\b(city|town|state|county|country)\b/.test(kind);
      if (cityLevel && !p.street && !p.housenumber) continue;
      return {
        lat,
        lng,
        source: "photon",
        precision: p.housenumber || p.street ? "street" : "neighborhood",
        displayName: [p.name, p.street, p.city, p.state].filter(Boolean).join(", "),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function tryStreetGeocode(
  streetName: string,
  houseNumber: string,
  city: string,
  uf: string,
  stateName: string,
  cep: string,
  near: GeoPoint | null,
): Promise<GeocodeResult | null> {
  const streetLine = [streetName, houseNumber].filter(Boolean).join(", ");

  const structured = await geocodeNominatimParams(
    {
      street: [streetName, houseNumber].filter(Boolean).join(" "),
      city,
      state: stateName || uf,
      postalcode: cep,
      country: "Brazil",
    },
    { rejectCityLevel: true },
  );
  if (structured) return structured;

  await sleep(1100);

  const free = await geocodeNominatimParams(
    {
      q: [streetLine, city, stateName || uf, "Brasil"].filter(Boolean).join(", "),
    },
    { rejectCityLevel: true },
  );
  if (free) return free;

  await sleep(250);

  const photon = await geocodePhoton(
    [streetLine, city, uf].filter(Boolean).join(", "),
    near,
  );
  if (photon) return photon;

  // Sem número — só o nome da rua
  if (houseNumber) {
    await sleep(250);
    const photonStreet = await geocodePhoton(
      [streetName, city, uf].filter(Boolean).join(", "),
      near,
    );
    if (photonStreet) return photonStreet;
  }

  return null;
}

/**
 * Geocodifica endereço BR com prioridade de rua/número.
 * Expande abreviações (R→Rua), enriquece pelo CEP e evita só o centro da cidade.
 */
export async function geocodeBrazilAddress(input: {
  address?: string | null;
  city?: string | null;
  uf?: string | null;
  cep?: string | null;
  near?: GeoPoint | null;
}): Promise<GeocodeResult | null> {
  let parts = parseBrazilAddressParts(input);
  const near = input.near ?? null;

  // Enriquece com BrasilAPI (nome oficial da rua + coords do CEP)
  const cepInfo = parts.cep ? await lookupBrasilApiCep(parts.cep) : null;
  if (cepInfo) {
    if (cepInfo.city && !parts.city) parts = { ...parts, city: cleanCity(cepInfo.city) };
    if (cepInfo.state && !parts.uf) {
      parts = {
        ...parts,
        uf: cepInfo.state,
        stateName: UF_STATE[cepInfo.state] ?? cepInfo.state,
      };
    }
    if (cepInfo.neighborhood && !parts.neighborhood) {
      parts = { ...parts, neighborhood: cepInfo.neighborhood };
    }
    // Se Omie mandou "R CAPITAO..." e o CEP tem a rua oficial, usa a oficial
    if (cepInfo.street) {
      const official = expandStreetName(cepInfo.street);
      const plain = stripAccents(parts.streetName);
      const omieWeak =
        /^(Rua|Avenida|Alameda|Travessa)\s+[A-Z0-9]{1,3}\b/i.test(plain) ||
        parts.streetName.length < official.length * 0.6 ||
        /^Rua\s+[A-Z]\s+[A-Z]\s+/i.test(plain);
      if (omieWeak || !parts.streetName) {
        parts = {
          ...parts,
          streetName: official,
          street: [official, parts.houseNumber].filter(Boolean).join(", "),
        };
      }
    }
  }

  const streetVariants = [
    parts.streetName,
    stripAccents(parts.streetName),
    expandStreetName(parts.streetName.replace(/^Rua\s+/i, "R. ")),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  for (const variant of streetVariants) {
    const hit = await tryStreetGeocode(
      variant,
      parts.houseNumber,
      parts.city,
      parts.uf,
      parts.stateName,
      parts.cep,
      near,
    );
    if (hit) return hit;
    await sleep(400);
  }

  // Rua do CEP (oficial) + número do Omie
  if (cepInfo?.street) {
    const official = expandStreetName(cepInfo.street);
    if (!streetVariants.includes(official)) {
      const hit = await tryStreetGeocode(
        official,
        parts.houseNumber,
        parts.city || cleanCity(cepInfo.city),
        parts.uf || cepInfo.state || "",
        parts.stateName,
        parts.cep,
        near,
      );
      if (hit) return hit;
    }
  }

  // Fallback CEP: útil entre cidades diferentes (Batatais × Monte Alto)
  if (cepInfo?.lat != null && cepInfo?.lng != null) {
    return {
      lat: cepInfo.lat,
      lng: cepInfo.lng,
      source: "brasilapi_cep",
      precision: "cep",
      displayName: [cepInfo.city, cepInfo.state].filter(Boolean).join("/"),
    };
  }

  if (parts.city) {
    return geocodeNominatimParams({
      q: [parts.city, parts.stateName || parts.uf, "Brasil"].filter(Boolean).join(", "),
    });
  }

  return null;
}

export type { GeoPoint };
