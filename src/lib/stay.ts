export const APP_TIMEZONE = "America/Sao_Paulo";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function civilInTimeZone(date: Date, timeZone = APP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

export function parseDateTimeInput(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(trimmed);
  if (match) {
    const hour = match[4] ?? "00";
    const minute = match[5] ?? "00";
    const second = match[6] ?? "00";
    return new Date(`${match[1]}-${match[2]}-${match[3]}T${hour}:${minute}:${second}-03:00`);
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseDateInput(value: string | null | undefined) {
  return parseDateTimeInput(value);
}

export function startOfLocalDay(value: Date) {
  const civil = civilInTimeZone(value);
  return new Date(`${civil.year}-${pad(civil.month)}-${pad(civil.day)}T00:00:00-03:00`);
}

export function endOfLocalDay(value: Date) {
  const civil = civilInTimeZone(value);
  return new Date(`${civil.year}-${pad(civil.month)}-${pad(civil.day)}T23:59:59.999-03:00`);
}

export function toDateInput(value: Date | string | null | undefined) {
  return toDateTimeInput(value).slice(0, 10);
}

export function toDateTimeInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const civil = civilInTimeZone(date);
  return `${civil.year}-${pad(civil.month)}-${pad(civil.day)}T${pad(civil.hour)}:${pad(civil.minute)}`;
}

export function stayWindow(checkIn: Date | string | null | undefined, checkOut: Date | string | null | undefined) {
  const checkInDate = checkIn instanceof Date ? checkIn : checkIn ? new Date(checkIn) : null;
  const checkOutDate = checkOut instanceof Date ? checkOut : checkOut ? new Date(checkOut) : null;
  const start = checkInDate && !Number.isNaN(checkInDate.getTime()) ? checkInDate : null;
  const end = checkOutDate && !Number.isNaN(checkOutDate.getTime()) ? checkOutDate : null;
  return { start, end };
}

export function isInStay(
  checkIn: Date | string | null | undefined,
  checkOut: Date | string | null | undefined,
  now = new Date(),
) {
  const { start, end } = stayWindow(checkIn, checkOut);
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

export function isCheckedOut(
  checkOut: Date | string | null | undefined,
  now = new Date(),
) {
  const { end } = stayWindow(null, checkOut);
  return Boolean(end && now > end);
}

export function unixSeconds(value: Date) {
  return Math.floor(value.getTime() / 1000);
}

export function toDeviceUnix(value: Date) {
  const civil = civilInTimeZone(value);
  return Math.floor(Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second) / 1000);
}

export function formatCpf(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function phoneDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  return digits.slice(0, 13);
}

export function formatPhone(value: string) {
  let digits = phoneDigits(value);
  if (digits.startsWith("55") && digits.length > 11) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function toWhatsAppChatId(value: string | null | undefined) {
  if (!value) return null;
  let digits = phoneDigits(value);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12 || digits.length > 15) return null;
  return `${digits}@c.us`;
}

export function formatStayDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const dateFmt: Intl.DateTimeFormatOptions = {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  };
  const timeFmt: Intl.DateTimeFormatOptions = {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  };
  return `${date.toLocaleDateString("pt-BR", dateFmt)} às ${date.toLocaleTimeString("pt-BR", timeFmt)}`;
}
