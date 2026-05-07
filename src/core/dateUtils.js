const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function partsToIso(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d) return '';
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function excelSerialToIsoDate(serial) {
  if (serial === null || serial === undefined || serial === '' || Number.isNaN(Number(serial))) return '';
  const wholeDays = Math.floor(Number(serial));
  const utc = Date.UTC(1899, 11, 30) + wholeDays * 24 * 60 * 60 * 1000;
  const date = new Date(utc);
  return partsToIso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function parseDateText(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return partsToIso(iso[1], iso[2], iso[3]);

  const dmyText = text.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/);
  if (dmyText) {
    const monthIndex = MONTHS.findIndex((m) => m.toLowerCase() === dmyText[2].slice(0, 3).toLowerCase());
    if (monthIndex >= 0) {
      const year = Number(dmyText[3]) < 100 ? Number(dmyText[3]) + 2000 : Number(dmyText[3]);
      return partsToIso(year, monthIndex + 1, dmyText[1]);
    }
  }

  const dmyNumeric = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyNumeric) {
    const year = Number(dmyNumeric[3]) < 100 ? Number(dmyNumeric[3]) + 2000 : Number(dmyNumeric[3]);
    return partsToIso(year, dmyNumeric[2], dmyNumeric[1]);
  }

  return '';
}

function toIsoDateOnly(value) {
  if (!value) return '';
  if (typeof value === 'number') return excelSerialToIsoDate(value);

  const parsedText = parseDateText(value);
  if (parsedText) return parsedText;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return partsToIso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  return '';
}

function formatDisplayDate(value) {
  const iso = toIsoDateOnly(value);
  if (!iso) return value ? String(value) : '';
  const [year, month, day] = iso.split('-').map(Number);
  return `${day}-${MONTHS[month - 1]}-${year}`;
}

module.exports = {
  excelSerialToIsoDate,
  toIsoDateOnly,
  formatDisplayDate
};
