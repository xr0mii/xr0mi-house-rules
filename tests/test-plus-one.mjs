import assert from 'node:assert/strict';
import {degree, plusOneCandidate, buySuccess} from '../scripts/hero-plus-one.mjs';
// Fixed edge cases: numerical boundaries, natural 1/20, and degree overrides.
assert.equal(degree(19,20,10).value,1);
assert.equal(degree(20,20,10).value,2);
assert.equal(degree(30,20,10).value,3);
assert.equal(degree(10,20,10).value,0);
assert.equal(degree(20,20,1).value,1);
assert.equal(degree(19,20,20).value,2);
assert.equal(degree(20,20,10,{success:{amount:-1,label:'Downgrade'}}).value,1);
assert.equal(degree(19,20,10,{failure:{amount:'success',label:'Upgrade'}}).value,2);
const actor={uuid:'Actor.a',type:'character',isOwner:true,system:{resources:{heroPoints:{value:2}}},async update(u){this.system.resources.heroPoints.value=u['system.resources.heroPoints.value'];}};
globalThis.game={user:{isGM:false},pf2e:{settings:{metagame:{dcs:true,results:true}}}};
class CheckRoll {
 constructor(){this.total=19;this.dice=[{faces:20,total:10}];this.options={totalModifier:9};}
 toJSON(){return {class:'CheckRoll',formula:'1d20+9',total:this.total,evaluated:true,terms:[{class:'Die',results:[{result:10,active:true}]},{class:'NumericTerm',number:9}],options:this.options};}
}
const context={type:'skill-check',outcome:'failure',dc:{value:20},options:[]};
const message={actor,isContentVisible:true,isOwner:true,isAuthor:true,blind:false,flags:{pf2e:{context}},rolls:[new CheckRoll()],getFlag(_id,key){return this.flags['xr0mi-house-rules']?.[key];},async update(u){this.updated=u;this.rolls=u.rolls;this.flags.pf2e.context=u['flags.pf2e.context'];this.flags['xr0mi-house-rules']={plusOne:u['flags.xr0mi-house-rules.plusOne']};}};
assert(plusOneCandidate(message));
class StrikeAttackRoll extends CheckRoll {}
message.rolls = [new StrikeAttackRoll()];
assert(plusOneCandidate(message), 'PF2e attack subclasses must be supported');
context.type = 'spell-attack-roll'; assert(plusOneCandidate(message)); context.type = 'attack-roll';
actor.system.resources.heroPoints.value = 0;
assert.equal(plusOneCandidate(message),null);
assert(plusOneCandidate(message,{ignorePoints:true}), 'Eligible roll must get an explanatory note when out of points');
actor.system.resources.heroPoints.value = 2;
message.rolls=[new CheckRoll()];context.type='skill-check';
message.rolls[0].dice[0].total=1;assert.equal(plusOneCandidate(message),null);
message.rolls[0].dice[0].total=10;game.pf2e.settings.metagame.dcs=false;assert.equal(plusOneCandidate(message),null);
game.pf2e.settings.metagame.dcs=true;message.blind=true;assert.equal(plusOneCandidate(message),null);message.blind=false;
context.outcome='criticalFailure';assert.equal(plusOneCandidate(message),null);context.outcome='failure';
context.dosAdjustments={success:{amount:-1,label:'Downgrade'}};assert.equal(plusOneCandidate(message),null);delete context.dosAdjustments;
globalThis.document={createElement:()=>({innerHTML:'',querySelectorAll:()=>[]})};
class Term {constructor(data){this.data=data;}toJSON(){return this.data;}}
globalThis.foundry={dice:{terms:{OperatorTerm:Term,NumericTerm:Term}}};
globalThis.Roll={fromData(data){return {total:data.total,options:data.options,data,async render(){return '<div>20</div>';}};}};
await buySuccess(message);
assert.equal(actor.system.resources.heroPoints.value,1);assert.equal(message.rolls[0].total,20);
assert.equal(message.flags.pf2e.context.outcome,'success');
assert.equal(message.rolls[0].data.terms[0].results[0].result,10);
assert.equal(message.updated['flags.xr0mi-house-rules.plusOne'].before,19);
assert.equal(plusOneCandidate(message),null);
console.log('PASS: degree boundaries and special adjustments, hidden DC, blind checks, natural 1, critical failures, degree adjustments, payment, unchanged d20, updated total/outcome, double use blocked.');
