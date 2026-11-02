import {escapeHTML, validateTransfer} from './rules.mjs';
import {registerDamageReroll} from './damage-reroll.mjs';
import {registerHeroPlusOne} from './hero-plus-one.mjs';
import {registerVillainPoints, mountVillainPanel} from './villain-points.mjs';
const ID = 'xr0mi-house-rules';
const e = escapeHTML;
const jobs = new Map();
let sections = [];
const points = actor => Number(actor.system.resources.heroPoints.value);
const cap = actor => Number(actor.system.resources.heroPoints.max ?? 3);
const owned = () => game.actors.filter(a => a.type === 'character' && a.isOwner);
async function serial(key, fn) {
  if (jobs.has(key)) return ui.notifications.warn('Предыдущая операция ещё выполняется.');
  jobs.set(key, true);
  try { return await fn(); } catch (error) { console.error(ID, error); ui.notifications.error(error.message); }
  finally { jobs.delete(key); }
}
export {requestTransfer, resolveTransfer};
async function requestTransfer(actor, target, description = '') {
  if (!actor?.isOwner || actor.type !== 'character') throw Error('Выберите своего персонажа.');
  validateTransfer(actor.id, target?.id, points(actor), target ? points(target) : 0, target ? cap(target) : 3);
  await ChatMessage.create({speaker: ChatMessage.getSpeaker({actor}),
    content: `<div class="xr0mi-card"><h3>Передача Очка Героя</h3><p>${e(actor.name)} → ${e(target.name)}</p>${description ? `<p>${e(description)}</p>` : ''}<p>Передача не применяется для Геройского восстановления.</p></div>`,
    flags: {[ID]: {transfer: {from: actor.id, to: target.id, user: game.user.id, status: 'pending'}}}});
}
async function resolveTransfer(message, accept) {
  if (!game.user.isGM) return;
  if (game.users.activeGM?.id !== game.user.id) return ui.notifications.warn('Запрос обрабатывает активный ведущий.');
  await serial('transfer', async () => {
    const request = message.getFlag(ID, 'transfer');
    if (!request || request.status !== 'pending') return;
    const updateStatus = status => message.setFlag(ID, 'transfer', {...request, status});
    if (!accept) { await updateStatus('declined'); return; }
    const source = game.actors.get(request.from), target = game.actors.get(request.to);
    const user = game.users.get(request.user);
    if (!source || !target || !user || source.type !== 'character' || target.type !== 'character') throw Error('Персонаж или автор запроса больше не существует.');
    if (message.author.id !== user.id || !source.testUserPermission(user, 'OWNER')) throw Error('У автора нет прав на персонажа-отправителя.');
    validateTransfer(source.id, target.id, points(source), points(target), cap(target));
    const sourceBefore = points(source), targetBefore = points(target);
    await updateStatus('processing');
    try {
      await source.update({'system.resources.heroPoints.value': sourceBefore - 1});
      try { await target.update({'system.resources.heroPoints.value': targetBefore + 1}); }
      catch (error) {
        if (points(source) === sourceBefore - 1) await source.update({'system.resources.heroPoints.value': sourceBefore});
        throw error;
      }
    } catch (error) { await updateStatus('error'); throw error; }
    await updateStatus('accepted');
    ui.notifications.info('Очко Героя передано.');
  });
}
export class HouseRules extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {id: ID, classes: ['xr0mi-window'], window: {title: 'Домашние правила · xr0mi', resizable: true}, position: {width: 780, height: 790}};
  async _renderHTML() {
    const root = document.createElement('div'); root.className = 'xr0mi-panel';
    const characters = owned();
    root.innerHTML = `<header class="xr0mi-banner"><span>ПРАВИЛА ВАШЕГО СТОЛА</span><h1>Истории, достойные героев</h1><p>Очки Героя, помощь союзникам и правила под рукой.</p></header>
      <nav class="xr0mi-tabs" aria-label="Разделы"><button type="button" data-tab="hero" aria-pressed="true">Очки и памятки</button><button type="button" data-tab="rules" aria-pressed="false">Свод правил</button></nav>
      <section data-pane="hero"><div class="xr0mi-box"><div class="xr0mi-heading"><h2>Передать Очко Героя</h2><span data-count class="xr0mi-count"></span></div>
      <label>Персонаж<select name="actor">${characters.map(a => `<option value="${a.id}">${e(a.name)}</option>`).join('')}</select></label>
      <label>Кому передать?<select name="target"></select></label>
      <p class="xr0mi-hint">Ведущий подтвердит передачу в чате. Для Геройского восстановления передавать очки нельзя.</p><button type="button" data-submit class="xr0mi-primary">Запросить передачу у ведущего</button><p data-feedback role="status" aria-live="polite"></p></div>
      <div data-villain-slot></div><div class="xr0mi-box"><h2>Отправить памятку в чат</h2><div class="xr0mi-buttons"><button type="button" data-card="rise">Помочь подняться <small>1 действие</small></button><button type="button" data-card="persistent">Продолжительный урон <small>2 действия</small></button><button type="button" data-card="aid">Помощь <small>КС и результаты</small></button></div></div></section>
      <section data-pane="rules" hidden><label class="xr0mi-search">Найти правило<input type="search" name="search" placeholder="Лечение, знания, пребаффы…"></label><p class="xr0mi-muted" data-rule-count>${sections.length} разделов · нажмите на название, чтобы раскрыть</p><div data-rules>${sections.map(s => `<details><summary>${e(s.title)}</summary><div class="xr0mi-rule-body">${s.image ? `<img class="xr0mi-ritual-image" src="modules/${ID}/${e(s.image)}" alt="Памятка домашних правил ритуалов" loading="lazy">` : ''}${s.lines.map(line => `<p>${e(line)}</p>`).join('')}</div></details>`).join('')}</div><p data-empty hidden>По вашему запросу ничего не найдено.</p></section>
      <footer class="xr0mi-footer">Домашние правила xr0mi <span>${e(game.modules.get(ID).version ?? "0.4.1")}</span></footer>`;
    for (const tab of root.querySelectorAll('[data-tab]')) tab.addEventListener('click', () => {
      for (const button of root.querySelectorAll('[data-tab]')) button.setAttribute('aria-pressed', String(button === tab));
      for (const pane of root.querySelectorAll('[data-pane]')) pane.hidden = pane.dataset.pane !== tab.dataset.tab;
    });
    const refresh = () => {
      const actor = game.actors.get(root.querySelector('[name=actor]').value);
      const targetSelect = root.querySelector('[name=target]');
      const previous = targetSelect.value;
      targetSelect.innerHTML = game.actors.filter(a => a.type === 'character' && a.id !== actor?.id).map(a => `<option value="${a.id}" ${a.id === previous ? 'selected' : ''}>${e(a.name)} · ${points(a)}/${cap(a)}</option>`).join('');
      root.querySelector('[data-count]').textContent = actor ? `${points(actor)} / ${cap(actor)}` : 'Нет персонажа';
      const target = game.actors.get(targetSelect.value);
      root.querySelector('[data-submit]').disabled = !actor || points(actor) < 1 || !target || points(target) >= cap(target);
      this.refreshVillain?.();
    };
    refresh();
    root.querySelector('[name=target]').addEventListener('change', refresh);
    root.querySelector('[name=actor]').addEventListener('change', refresh);
    this.refreshPoints = refresh;
    this.refreshVillain = mountVillainPanel(root, () => game.actors.get(root.querySelector('[name=actor]').value));
    root.querySelector('[data-submit]').addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      try {
        const actor = game.actors.get(root.querySelector('[name=actor]').value);
        root.querySelector('[data-feedback]').textContent = '';
        await requestTransfer(actor, game.actors.get(root.querySelector('[name=target]').value));
        root.querySelector('[data-feedback]').textContent = 'Запрос отправлен в чат. Ведущий подтвердит передачу.';
      } catch (error) { ui.notifications.error(error.message); }
      finally { refresh(); }
    });
    root.querySelector('[name=search]').addEventListener('input', event => {
      const query = event.target.value.toLocaleLowerCase('ru');
      for (const section of root.querySelectorAll('details')) { section.hidden = !section.textContent.toLocaleLowerCase('ru').includes(query); section.open = Boolean(query) && !section.hidden; }
      root.querySelector('[data-empty]').hidden = [...root.querySelectorAll('details')].some(section => !section.hidden);
    });
    for (const button of root.querySelectorAll('[data-card]')) button.addEventListener('click', () => postCard(button.dataset.card));
    return root;
  }
  _replaceHTML(result, content) { content.replaceChildren(result); }
  _onFirstRender() {
    this.actorHook = Hooks.on('updateActor', () => this.refreshPoints?.());
    this.villainHook = Hooks.on('xr0miVillainPointsChanged', () => this.refreshVillain?.());
  }
  _onClose() {
    if (this.actorHook !== undefined) Hooks.off('updateActor', this.actorHook);
    if (this.villainHook !== undefined) Hooks.off('xr0miVillainPointsChanged', this.villainHook);
  }
}
async function postCard(key) {
  const cards = {
    rise: ['Помочь подняться — 1 действие', 'Воздействие. Нужна свободная рука и союзник рядом или в безоружной досягаемости. Нельзя поднять существо на две категории размера больше без Борца с титанами. Примените изменение положения союзника вручную.'],
    persistent: ['Снять продолжительный урон — 2 действия', 'С себя или соседнего союзника: дополнительная проверка восстановления до получения урона, базовый КС 15, ведущий может снизить. Кровотечение требует Оказания первой помощи.'],
    aid: ['Помощь — домашнее правило', 'КС равен КС основной проверки; ведущий может применить −2 или −4. Критический успех: +4; успех: +2; провал: +1; критический провал: −1. Бонусы к самой проверке Помощи уменьшаются вдвое. КС и бонус применяются вручную.']
  };
  if (cards[key]) await ChatMessage.create({content: `<div class="xr0mi-card"><h3>${e(cards[key][0])}</h3><p>${e(cards[key][1])}</p></div>`});
}
Hooks.once('init', () => {
  registerDamageReroll();
  registerHeroPlusOne();
  registerVillainPoints();
  game.settings.registerMenu(ID, 'panel', {name: 'Домашние правила', label: 'Открыть правила и Очки Героя', icon: 'fas fa-scroll', type: HouseRules, restricted: false});
  game.keybindings.register(ID, 'open', {name: 'Открыть домашние правила', editable: [{key: 'KeyH', modifiers: ['Shift'] }], onDown: () => { new HouseRules().render({force: true}); return true; }});
});
Hooks.once('ready', async () => {
  const response = await fetch(`modules/${ID}/data/rules.json`);
  if (response.ok) sections = await response.json();
  else ui.notifications.error('Не удалось загрузить свод домашних правил.');
  game.modules.get(ID).api = {open: () => new HouseRules().render({force: true})};
});
Hooks.on('renderChatMessageHTML', (message, html) => {
  const request = message.getFlag(ID, 'transfer');
  if (!request) return;
  const root = html instanceof HTMLElement ? html : html[0];
  const status = document.createElement('p');
  status.textContent = ({pending: 'Ожидает решения ведущего', processing: 'Передача выполняется', accepted: 'Передача выполнена', declined: 'Передача отклонена', error: 'Ошибка передачи — ведущему нужно проверить очки обоих персонажей'})[request.status];
  root.append(status);
  if (request.status === 'pending' && game.user.isGM) {
    for (const [text, accept] of [['Передать очко', true], ['Отклонить', false]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
      button.addEventListener('click', () => resolveTransfer(message, accept)); root.append(button);
    }
  }
});
