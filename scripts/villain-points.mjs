import {escapeHTML as e} from './rules.mjs';
const ID = 'xr0mi-house-rules';
let busy = false;
export const villainPoints = () => Number(game.settings.get(ID, 'villainPoints'));
const heroPoints = actor => Number(actor.system.resources.heroPoints.value);
const heroCap = actor => Number(actor.system.resources.heroPoints.max ?? 3);
const activeGM = () => game.user.isGM && game.users.activeGM?.id === game.user.id;
const setPoints = value => game.settings.set(ID, 'villainPoints', value);
async function exclusive(operation) {
  if (busy) throw Error('Предыдущая операция с Очками Злодея ещё выполняется.');
  busy = true;
  try {return await operation();} finally {busy = false;}
}
export async function requestVillain(actor, kind) {
  if (!['gift', 'trade'].includes(kind)) throw Error('Неизвестное предложение.');
  if (actor?.type !== 'character' || !actor.isOwner) throw Error('Выберите своего персонажа.');
  if (villainPoints() >= 3) throw Error('У ведущего уже 3 Очка Злодея.');
  if (kind === 'trade' && heroPoints(actor) >= heroCap(actor)) throw Error('У персонажа уже максимум Очков Героя.');
  return ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),
    content: `<div class="xr0mi-card"><h3>${kind === 'gift' ? 'Подарок ведущему' : 'Сделка с ведущим'}</h3><p>${e(actor.name)} ${kind === 'gift' ? 'предлагает ведущему 1 Очко Злодея.' : 'предлагает ведущему 1 Очко Злодея в обмен на 1 Очко Героя.'}</p></div>`,
    flags: {[ID]: {villainRequest: {actor: actor.id, user: game.user.id, kind, status: 'pending'}}}});
}
export async function resolveVillain(message, accept) {
  if (!activeGM()) throw Error('Предложения принимает активный ведущий.');
  return exclusive(async () => {
    const request = message.getFlag(ID, 'villainRequest');
    if (!request || request.status !== 'pending') return;
    const status = value => message.setFlag(ID, 'villainRequest', {...request, status: value});
    if (!accept) {await status('declined'); return;}
    const actor = game.actors.get(request.actor), user = game.users.get(request.user);
    if (!actor || actor.type !== 'character' || !user || message.author.id !== user.id || !actor.testUserPermission(user, 'OWNER')) throw Error('Автор предложения не владеет этим персонажем.');
    if (!['gift', 'trade'].includes(request.kind)) throw Error('Неизвестное предложение.');
    const before = villainPoints(), heroBefore = heroPoints(actor);
    if (before >= 3) throw Error('У ведущего уже 3 Очка Злодея.');
    if (request.kind === 'trade' && heroBefore >= heroCap(actor)) throw Error('У персонажа уже максимум Очков Героя.');
    await status('processing');
    try {
      await setPoints(before + 1);
      try {
        if (request.kind === 'trade') await actor.update({'system.resources.heroPoints.value': heroBefore + 1});
      } catch (error) {
        if (villainPoints() === before + 1) await setPoints(before);
        throw error;
      }
    } catch (error) {await status('error'); throw error;}
    await status('accepted');
    ui.notifications.info(request.kind === 'trade' ? 'Сделка состоялась: +1 Очко Злодея и +1 Очко Героя.' : 'Подарок принят: +1 Очко Злодея.');
  });
}
export async function adjustVillain(action) {
  if (!activeGM()) throw Error('Запас меняет активный ведущий.');
  return exclusive(async () => {
    const before = villainPoints();
    const after = action === 'session' ? (before === 0 ? 1 : before) : action === 'spend' ? before - 1 : action === 'add' ? before + 1 : NaN;
    if (!Number.isInteger(after) || after < 0 || after > 3) throw Error('Запас должен быть от 0 до 3.');
    if (before === after) return;
    await setPoints(after);
    try {
      await ChatMessage.create({content: `<div class="xr0mi-card"><h3>Очки Злодея</h3><p>${action === 'spend' ? 'Ведущий потратил 1 очко' : action === 'session' ? 'Начало сессии: восстановлено 1 очко' : 'Ведущий добавил 1 очко'}. Запас: ${after} / 3.</p></div>`});
    } catch {ui.notifications.warn('Запас изменён, но сообщение не отправлено.');}
  });
}
export function mountVillainPanel(root, getActor) {
  const slot = root.querySelector('[data-villain-slot]');
  slot.innerHTML = `<div class="xr0mi-box xr0mi-villain"><div class="xr0mi-heading"><h2>Очки Злодея</h2><span class="xr0mi-count" data-villain-count></span></div>
    <p class="xr0mi-hint">Общий запас ведущего. Сохраняется между сессиями.</p>
    <div class="xr0mi-villain-actions"><button type="button" data-villain="gift">Подарить 1 Очко Злодея<small>Без награды персонажу</small></button><button type="button" data-villain="trade">Предложить обмен<small>Ведущему +1 Злодея · вам +1 Героя</small></button></div>
    <p class="xr0mi-hint">Предложение отправится в чат. Очки начислятся после согласия ведущего.</p>
    ${game.user.isGM ? '<div class="xr0mi-gm-controls"><button type="button" data-villain="spend">Потратить 1</button><button type="button" data-villain="add">Добавить 1</button><button type="button" data-villain="session">Начало сессии</button></div>' : ''}
    <p data-villain-feedback role="status" aria-live="polite"></p></div>`;
  let pending = false;
  const refresh = () => {
    const value = villainPoints(), actor = getActor();
    slot.querySelector('[data-villain-count]').textContent = `${value} / 3`;
    for (const button of slot.querySelectorAll('[data-villain]')) {
      const action = button.dataset.villain;
      button.disabled = pending || (['gift', 'trade'].includes(action) ? !actor || value >= 3 || action === 'trade' && heroPoints(actor) >= heroCap(actor) : !activeGM() || (action === 'spend' ? value <= 0 : action === 'session' ? value !== 0 : value >= 3));
    }
  };
  for (const button of slot.querySelectorAll('[data-villain]')) button.addEventListener('click', async () => {
    pending = true; refresh();
    const feedback = slot.querySelector('[data-villain-feedback]'); feedback.textContent = '';
    try {
      if (['gift', 'trade'].includes(button.dataset.villain)) {
        await requestVillain(getActor(), button.dataset.villain);
        feedback.textContent = 'Предложение отправлено в чат.';
      } else await adjustVillain(button.dataset.villain);
    } catch (error) {ui.notifications.error(error.message);}
    finally {pending = false; refresh();}
  });
  refresh(); return refresh;
}
export function registerVillainPoints() {
  game.settings.register(ID, 'villainPoints', {name: 'Запас Очков Злодея', scope: 'world', config: false, type: Number, default: 0,
    range: {min: 0, max: 3, step: 1}, onChange: () => Hooks.callAll('xr0miVillainPointsChanged')});
  Hooks.on('renderChatMessageHTML', (message, html) => {
    const request = message.getFlag(ID, 'villainRequest');
    if (!request || !message.isContentVisible) return;
    const root = html instanceof HTMLElement ? html : html[0];
    const status = document.createElement('p');
    status.textContent = ({pending: 'Ожидает согласия ведущего', processing: 'Применяется', accepted: request.kind === 'trade' ? 'Сделка состоялась: ведущему +1 Очко Злодея, персонажу +1 Очко Героя.' : 'Подарок принят: ведущему +1 Очко Злодея.', declined: 'Предложение отклонено', error: 'Ошибка — ведущему нужно проверить запас очков'})[request.status];
    root.append(status);
    if (request.status !== 'pending' || !activeGM()) return;
    for (const [label, accept] of [['Принять', true], ['Отклонить', false]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {await resolveVillain(message, accept);} catch (error) {ui.notifications.error(error.message); button.disabled = false;}
      }); root.append(button);
    }
  });
}
