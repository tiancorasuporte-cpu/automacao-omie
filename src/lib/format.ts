export function formatRelative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "Nunca";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Nunca";
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "há 1 hora" : `há ${hours} horas`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

const APP_TIMEZONE = "America/Sao_Paulo";

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const dateFmt: Intl.DateTimeFormatOptions = { timeZone: APP_TIMEZONE, day: "2-digit", month: "2-digit", year: "numeric" };
  const timeFmt: Intl.DateTimeFormatOptions = { timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit" };
  const today = new Date();
  const sameDay =
    date.toLocaleDateString("pt-BR", dateFmt) === today.toLocaleDateString("pt-BR", dateFmt);
  const time = date.toLocaleTimeString("pt-BR", timeFmt);
  if (sameDay) return `Hoje, ${time}`;
  return `${date.toLocaleDateString("pt-BR", dateFmt)}, ${time}`;
}

export const DEVICE_MODELS = [
  {
    id: "idbio" as const,
    name: "Control ID Bio",
    icon: "fingerprint",
    specs: ["Fingerprint + RFID", "Up to 3,000 templates", "TCP/IP, Wiegand"],
    defaultPort: 80,
  },
  {
    id: "idface_max" as const,
    name: "Control ID Face MAX",
    icon: "face",
    specs: ["Facial Recognition + RFID", "Up to 10,000 faces capacity", "TCP/IP, Wiegand, Relays"],
    defaultPort: 80,
  },
  {
    id: "idface" as const,
    name: "Control ID iFace",
    icon: "dns",
    specs: ["Facial Recognition", "TCP/IP, Relays", "Standalone or Online"],
    defaultPort: 80,
  },
] as const;

export function modelIcon(model: string) {
  if (model === "idface_max") return "face";
  if (model === "idface") return "dns";
  if (model === "idbio") return "fingerprint";
  return "sensor_door";
}

export function modelLabel(model: string) {
  return DEVICE_MODELS.find((item) => item.id === model)?.name ?? model;
}
