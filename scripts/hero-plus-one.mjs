const ID = 'xr0mi-house-rules';
const busy = new Set();
const outcomes = ['criticalFailure', 'failure', 'success', 'criticalSuccess'];
const clamp = value => Math.max(0, Math.min(3, value));
export function degree(total, dc, die, adjustments = {}) {
  let value = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1;
  value = clamp(value + (die === 20 ? 1 : die === 1 ? -1 : 0));
  const unadjusted = value;
  for (const key of ['all', ...outcomes]) {
    const adjustment = adjustments[key];
    if (!adjustment?.amount || !adjustment.label || (key !== 'all' && key !== outcomes[value])) continue;
    if (value === 3 && adjustment.amount === 1 || value === 0 && adjustment.amount === -1) continue;
    value = typeof adjustment.amount === 'number' ? clamp(value + adjustment.amount) : outcomes.indexOf(adjustment.amount);
    break;
  }
  return {value, unadjusted};
}
export function plusOneCandidate(message, {ignorePoints = false} = {}) {
  const context = message?.flags?.pf2e?.context, roll = message?.rolls?.[0];
  const actor = message?.actor ?? message?.speakerActor;
  if (!message?.isContentVisible || !message.isOwner || !(message.isAuthor || game.user.isGM) || message.blind
    || context?.options?.includes('secret') || context?.traits?.includes('secret')
    || actor?.type !== 'character' || !actor.isOwner || (!ignorePoints && Number(actor.system.resources.heroPoints.value) < 1)
    || message.getFlag(ID, 'plusOne') || context?.options?.includes('xr0mi:hero-plus-one')
    || message.flags?.core?.initiativeRoll || message.rolls?.length !== 1
    || !(message.isCheckRoll || ['CheckRoll', 'StrikeAttackRoll'].includes(roll?.constructor.name))
    || !['attack-roll', 'spell-attack-roll', 'skill-check', 'saving-throw'].includes(context?.type)
    || context.outcome !== 'failure' || !Number.isFinite(context.dc?.value)
    || context.dc.value - roll.total !== 1) return null;
  // Never expose a hidden DC to the player through the appearance of the offer.
  if (!game.user.isGM && !(game.pf2e.settings.metagame.dcs && game.pf2e.settings.metagame.results)) return null;
  const die = roll.dice.find(die => die.faces === 20)?.total;
  if (!Number.isFinite(die)) return null;
  const current = degree(roll.total, context.dc.value, die, context.dosAdjustments);
  const next = degree(roll.total + 1, context.dc.value, die, context.dosAdjustments);
  if (current.value !== 1 || next.value !== 2) return null;
  return {actor, roll, context, next};
}
export async function buySuccess(message) {
  const candidate = plusOneCandidate(message);
  if (!candidate) throw Error('Для этого броска покупка +1 недоступна.');
  const {actor, roll, context, next} = candidate;
  if (busy.has(actor.uuid)) return;
  busy.add(actor.uuid);
  try {
    const data = structuredClone(roll.toJSON());
    const {OperatorTerm, NumericTerm} = foundry.dice.terms;
    data.terms.push(new OperatorTerm({operator: '+'}).toJSON(), new NumericTerm({number: 1, options: {flavor: 'Очко Героя'}}).toJSON());
    data.formula += ' + 1'; data.total += 1;
    data.options.totalModifier = Number(data.options.totalModifier ?? 0) + 1;
    data.options.degreeOfSuccess = 2;
    const improved = Roll.fromData(data);
    const content = await improved.render();
    const flavor = document.createElement('div'); flavor.innerHTML = message.flavor ?? '';
    flavor.querySelectorAll('.target-dc-result, ul.notes').forEach(node => node.remove());
    if (!plusOneCandidate(message)) throw Error('Очки или результат уже изменились.');
    const before = Number(actor.system.resources.heroPoints.value);
    await actor.update({'system.resources.heroPoints.value': before - 1});
    try {
      await message.update({rolls: [improved], content, flavor: flavor.innerHTML,
        'flags.pf2e.context': {...context, outcome: 'success', unadjustedOutcome: outcomes[next.unadjusted], options: [...context.options ?? [], 'xr0mi:hero-plus-one']},
        [`flags.${ID}.plusOne`]: {before: roll.total, after: improved.total, user: game.user.id}});
    } catch (error) {
      if (Number(actor.system.resources.heroPoints.value) === before - 1) await actor.update({'system.resources.heroPoints.value': before});
      throw error;
    }
  } finally {busy.delete(actor.uuid);}
}
export function registerHeroPlusOne() {
  Hooks.on('renderChatMessageHTML', (message, html) => {
    if (!message.isContentVisible) return;
    const root = html instanceof HTMLElement ? html : html[0];
    const used = message.getFlag(ID, 'plusOne');
    if (used) {
      const note = document.createElement('p'); note.className = 'xr0mi-reroll-note';
      note.textContent = `Очко Героя +1 · ${used.before} → ${used.after} · Успех`; root.append(note); return;
    }
    const candidate = plusOneCandidate(message);
    if (!candidate) return;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'xr0mi-buy-success';
    button.textContent = 'Потратить Очко Героя: успех (+1)';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {await buySuccess(message);} catch (error) {ui.notifications.error(error.message); button.disabled = !plusOneCandidate(message);}
    });
    root.append(button);
  });
  Hooks.on('updateActor', (actor, changes) => {
    if (!foundry.utils.hasProperty(changes, 'system.resources.heroPoints') && !Object.keys(changes).some(key => key.startsWith('system.resources.heroPoints'))) return;
    for (const message of game.messages.contents) {
      if ((message.actor ?? message.speakerActor)?.uuid !== actor.uuid) continue;
      if (!document.querySelector(`[data-message-id="${message.id}"]`)) continue;
      void ui.chat.updateMessage(message);
    }
  });
}
