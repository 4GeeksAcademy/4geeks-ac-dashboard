// Parse a money amount typed by people: "4500", "4.500", "4,500.00", "4.500,00 €", "$12,999".
function money(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 0 ? v : null;
  let s = String(v).replace(/[^0-9.,-]/g, '');
  const lastDot = s.lastIndexOf('.'); const lastComma = s.lastIndexOf(',');
  if (lastDot > -1 && lastComma > -1) {
    // whichever comes last is the decimal mark
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot > -1 && /\.\d{3}$/.test(s) && s.indexOf('.') !== lastDot) {
    s = s.replace(/\./g, '');
  } else if (lastDot > -1 && /^\d{1,3}\.\d{3}$/.test(s)) {
    s = s.replace('.', '');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
module.exports = { money };
