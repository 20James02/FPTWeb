import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let compared;
const context = vm.createContext({
  window: { PageFPTAccessories: { current: () => ({equipment: []}) } },
  document: {addEventListener() {}},
  toggleCompare: (...args) => { compared = args; },
});
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/catalog.js', 'utf8'), context);
const button = {dataset: {planId: 'plan', planName: 'Plan', speed: '300', equipment: 'Default modem'}, closest: () => null};
context.comparePublishedPlan(button);
assert.equal(compared[4], 'Không kèm thiết bị');
context.window.PageFPTAccessories.current = () => ({equipment: ['Period modem']});
context.comparePublishedPlan(button);
assert.equal(compared[4], 'Period modem');
context.window.PageFPTAccessories.current = () => null;
context.comparePublishedPlan(button);
assert.equal(compared[4], 'Default modem');
console.log('Comparison respects per-period equipment, explicit empty and fallback PASS');
