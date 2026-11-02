import assert from 'node:assert/strict';
import {canRerollDamage, rerollDamage, registerDamageReroll} from '../scripts/damage-reroll.mjs';
const actor = {uuid: 'Actor.a', type: 'character', isOwner: true, system: {resources: {heroPoints: {value: 2}}}, async update(u) {this.system.resources.heroPoints.value = u['system.resources.heroPoints.value'];}};
let confirm = true;
globalThis.foundry = {applications: {api: {DialogV2: {confirm: async () => confirm}}}};
globalThis.game = {user: {isGM: false}};
class DamageRoll {
  constructor(total = 7, kinds = ['healing']) {this.total = total; this.kinds = new Set(kinds); this.formula = '2d8+4';}
  async reroll() {return new DamageRoll(12, [...this.kinds]);}
  async render() {return '<div>12 healing</div>';}
}
const flags = {};
const message = {actor, isContentVisible: true, isOwner: true, isAuthor: true, rolls: [new DamageRoll()], whisper: ['gm'], blind: true,
  getFlag: (_id, key) => flags[key], async update(u) {this.rolls = u.rolls; this.content = u.content; flags.damageReroll = u['flags.xr0mi-house-rules.damageReroll'];}};
assert(canRerollDamage(message));
confirm = false; await rerollDamage(message); assert.equal(actor.system.resources.heroPoints.value, 2);
confirm = true; await rerollDamage(message);
assert.equal(actor.system.resources.heroPoints.value, 1);
assert.equal(message.rolls[0].total, 12);
assert(message.rolls[0].kinds.has('healing'));
assert.deepEqual(message.whisper, ['gm']); assert(message.blind);
assert.equal(flags.damageReroll.before[0], 7);
assert.equal(canRerollDamage(message), false);
await assert.rejects(() => rerollDamage(message));
delete flags.damageReroll;
message.update = async () => {throw Error('Simulated message update failure');};
await assert.rejects(() => rerollDamage(message));
assert.equal(actor.system.resources.heroPoints.value, 1);
message.isAuthor = false; assert.equal(canRerollDamage(message), false);
message.isAuthor = true; message.rolls = [{constructor: {name: 'CheckRoll'}}]; assert.equal(canRerollDamage(message), false);
message.rolls = [new DamageRoll()]; actor.system.resources.heroPoints.value = 0; assert.equal(canRerollDamage(message), false);
const hooks = new Map(); globalThis.Hooks = {on: (key, fn) => hooks.set(key, fn)};
registerDamageReroll();
const entries = []; hooks.get('getChatMessageContextOptions')({}, entries);
assert.equal(entries.length, 1); assert.equal(typeof entries[0].visible, 'function'); assert.equal(typeof entries[0].onClick, 'function');
console.log('PASS: healing and damage rerolls, cancellation, resource cost, privacy fields, second reroll blocked, rollback, permissions, d20 exclusion, empty resource, Foundry 14 context menu API.');
