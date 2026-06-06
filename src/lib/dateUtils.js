export function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateString() {
  return formatLocalDate(new Date());
}

export function getTodayDateFormatted() {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDaysToDateString(dateStr, days) {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

export function getDaysRemaining(dateStr) {
  const expiry = parseLocalDate(dateStr);
  const today = parseLocalDate(getTodayDateString());
  return Math.ceil((expiry - today) / 86400000);
}

export function formatMembershipStatus(dateStr) {
  const daysRemaining = getDaysRemaining(dateStr);
  if (daysRemaining < 0) {
    return {
      daysRemaining,
      label: `Vencido hace ${Math.abs(daysRemaining)} dia${Math.abs(daysRemaining) === 1 ? '' : 's'}`,
      tone: 'danger',
    };
  }

  if (daysRemaining === 0) {
    return { daysRemaining, label: 'Vence hoy', tone: 'warning' };
  }

  return {
    daysRemaining,
    label: `${daysRemaining} dia${daysRemaining === 1 ? '' : 's'} restantes`,
    tone: daysRemaining <= 5 ? 'warning' : 'success',
  };
}
