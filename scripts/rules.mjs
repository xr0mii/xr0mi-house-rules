export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}
export function validateTransfer(source, target, available, received, maximum) {
  if (!target) throw Error('Выберите получателя.');
  if (source === target) throw Error('Нельзя передать очко самому себе.');
  if (!Number.isFinite(available) || available < 1) throw Error('У отправителя нет Очков Героя.');
  if (!Number.isFinite(received) || !Number.isFinite(maximum) || received >= maximum) throw Error('У получателя уже максимум Очков Героя.');
  return true;
}
