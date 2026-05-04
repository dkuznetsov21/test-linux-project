const COUNTRY_ALIASES = {
  UK: 'GB',
};

export function sanitizeInput(value) {
  return value
    .replace(/\u001b\[200~/g, '')
    .replace(/\u001b\[201~/g, '')
    .replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\r/g, '');
}

export function normalizeCustomerCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeGeo(value) {
  const geo = value.trim().toUpperCase();

  return COUNTRY_ALIASES[geo] ?? geo;
}

export function normalizeTopicForDirectory(value) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ');
}

export function normalizeDomains(input) {
  return input
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatDisplayDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${day}.${month}`;
}

export function buildOutputDirectoryName(values, date = new Date()) {
  return `${values.customerCode} ${formatDisplayDate(date)} ${values.geo} (${normalizeTopicForDirectory(values.topic)})`;
}

export function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}
