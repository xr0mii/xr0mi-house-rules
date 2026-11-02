const ID = 'xr0mi-house-rules';
const busy = new Set();
export function damageActor(message) {
  const actor = message?.actor ?? message?.speakerActor;
  return actor?.type === 'familiar' ? actor.master : actor;
}
export function canRerollDamage(message) {
  const actor = damageActor(message);
  return Boolean(message?.isContentVisible && message.isOwner && actor?.type === 'character' && actor.isOwner
    && (message.isAuthor || game.user.isGM)
    && Number(actor.system.resources.heroPoints.value) > 0
    && !message.getFlag(ID, 'damageReroll')
    && message.rolls?.length && message.rolls.every(roll => roll.constructor.name === 'DamageRoll'));
}
export async function rerollDamage(message) {
  if (!canRerollDamage(message)) throw Error('Этот бросок нельзя перебросить за Очко Героя.');
  const actor = damageActor(message);
  if (busy.has(actor.uuid)) return;
  busy.add(actor.uuid);
  try {
    const confirmed = await foundry.applications.api.DialogV2.confirm({window: {title: 'Переброс за Очко Героя'},
      content: '<p>Перебросить все кости урона или лечения за <strong>1 Очко Героя</strong>? Второй результат заменит первый, даже если окажется ниже.</p><p>Если первый результат уже применён к здоровью, сначала отмените его применение. Модуль не меняет здоровье автоматически.</p>', rejectClose: false});
    if (!confirmed || !canRerollDamage(message)) return;
    const rolls = [];
    for (const roll of message.rolls) rolls.push(await roll.reroll({allowInteractive: false}));
    const content = (await Promise.all(rolls.map(roll => roll.render()))).join('');
    // Check again after dice evaluation: an ordinary sheet operation could have spent the point.
    if (!canRerollDamage(message)) throw Error('Очки или исходное сообщение изменились. Переброс не применён.');
    const before = Number(actor.system.resources.heroPoints.value);
    await actor.update({'system.resources.heroPoints.value': before - 1});
    try {
      await message.update({rolls, content, [`flags.${ID}.damageReroll`]: {
        actor: actor.uuid, user: game.user.id, before: message.rolls.map(roll => roll.total), after: rolls.map(roll => roll.total)
      }});
    } catch (error) {
      if (Number(actor.system.resources.heroPoints.value) === before - 1) await actor.update({'system.resources.heroPoints.value': before});
      throw error;
    }
  } finally { busy.delete(actor.uuid); }
}
export function registerDamageReroll() {
  Hooks.on('getChatMessageContextOptions', (_app, entries) => {
    const messageFor = element => game.messages.get(element.dataset.messageId);
    entries.push({label: 'Перебросить урон / лечение за Очко Героя', icon: 'fa-solid fa-dice',
      visible: element => canRerollDamage(messageFor(element)),
      onClick: async (_event, element) => {
        try { await rerollDamage(messageFor(element)); }
        catch (error) { console.error(ID, error); ui.notifications.error(error.message); }
      }});
  });
  Hooks.on('renderChatMessageHTML', (message, html) => {
    const reroll = message.getFlag(ID, 'damageReroll');
    if (!reroll || !message.isContentVisible) return;
    const root = html instanceof HTMLElement ? html : html[0];
    const label = document.createElement('p'); label.className = 'xr0mi-reroll-note';
    label.textContent = `Переброс за 1 Очко Героя · ${reroll.before.join(' + ')} → ${reroll.after.join(' + ')} · используется новый результат`;
    root.append(label);
  });
}
