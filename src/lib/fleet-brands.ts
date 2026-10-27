/** Marcas de veículos com símbolo para UI da Frota. */

export type FleetBrandId =
  | "chevrolet"
  | "fiat"
  | "volkswagen"
  | "ford"
  | "toyota"
  | "honda"
  | "honda-moto"
  | "hyundai"
  | "renault"
  | "nissan"
  | "jeep"
  | "peugeot"
  | "citroen"
  | "mitsubishi"
  | "chery"
  | "bmw"
  | "mercedes"
  | "audi"
  | "kia"
  | "byd"
  | "ram"
  | "volvo"
  | "yamaha"
  | "other";

const ALIASES: Record<string, FleetBrandId> = {
  chevrolet: "chevrolet",
  chevy: "chevrolet",
  gm: "chevrolet",
  "general motors": "chevrolet",
  fiat: "fiat",
  volkswagen: "volkswagen",
  vw: "volkswagen",
  ford: "ford",
  toyota: "toyota",
  honda: "honda",
  "honda moto": "honda-moto",
  "honda motos": "honda-moto",
  moto: "honda-moto",
  hyundai: "hyundai",
  renault: "renault",
  nissan: "nissan",
  jeep: "jeep",
  peugeot: "peugeot",
  citroen: "citroen",
  citroën: "citroen",
  mitsubishi: "mitsubishi",
  chery: "chery",
  "caoa chery": "chery",
  caoa: "chery",
  bmw: "bmw",
  mercedes: "mercedes",
  "mercedes-benz": "mercedes",
  "mercedes benz": "mercedes",
  audi: "audi",
  kia: "kia",
  byd: "byd",
  ram: "ram",
  volvo: "volvo",
  yamaha: "yamaha",
};

export const FLEET_BRAND_LABELS: Record<FleetBrandId, string> = {
  chevrolet: "Chevrolet",
  fiat: "Fiat",
  volkswagen: "Volkswagen",
  ford: "Ford",
  toyota: "Toyota",
  honda: "Honda",
  "honda-moto": "Honda Moto",
  hyundai: "Hyundai",
  renault: "Renault",
  nissan: "Nissan",
  jeep: "Jeep",
  peugeot: "Peugeot",
  citroen: "Citroën",
  mitsubishi: "Mitsubishi",
  chery: "Chery",
  bmw: "BMW",
  mercedes: "Mercedes-Benz",
  audi: "Audi",
  kia: "Kia",
  byd: "BYD",
  ram: "RAM",
  volvo: "Volvo",
  yamaha: "Yamaha",
  other: "Outra",
};

/** Sugestões no cadastro de veículo. */
export const FLEET_BRAND_OPTIONS = (
  Object.keys(FLEET_BRAND_LABELS) as FleetBrandId[]
).filter((id) => id !== "other");

function normalizeBrand(raw: string | null | undefined) {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveFleetBrand(raw: string | null | undefined): FleetBrandId {
  const n = normalizeBrand(raw);
  if (!n) return "other";
  if (ALIASES[n]) return ALIASES[n]!;
  // match by contained brand token (e.g. "Chevrolet Onix")
  for (const [alias, id] of Object.entries(ALIASES)) {
    if (n === alias || n.startsWith(`${alias} `) || n.endsWith(` ${alias}`) || n.includes(` ${alias} `)) {
      return id;
    }
  }
  if (n.includes("honda") && (n.includes("moto") || n.includes("cg") || n.includes("biz"))) {
    return "honda-moto";
  }
  return "other";
}

export function fleetBrandLabel(raw: string | null | undefined) {
  const id = resolveFleetBrand(raw);
  if (id !== "other") return FLEET_BRAND_LABELS[id];
  const t = String(raw ?? "").trim();
  return t || FLEET_BRAND_LABELS.other;
}

/** Logos oficiais em `/public/fleet-brands` (dataset car-logos). */
const BRANDS_WITH_LOGO = new Set<FleetBrandId>([
  "chevrolet",
  "fiat",
  "volkswagen",
  "ford",
  "toyota",
  "honda",
  "honda-moto",
  "hyundai",
  "renault",
  "nissan",
  "jeep",
  "peugeot",
  "citroen",
  "mitsubishi",
  "chery",
  "bmw",
  "mercedes",
  "audi",
  "kia",
  "byd",
  "ram",
  "volvo",
]);

export function fleetBrandLogoUrl(raw: string | null | undefined): string | null {
  const id = resolveFleetBrand(raw);
  if (!BRANDS_WITH_LOGO.has(id)) return null;
  return `/fleet-brands/${id}.png`;
}
