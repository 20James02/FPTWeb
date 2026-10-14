import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('src/pagefpt/static/js/client/bottom_sheet.js', 'utf8');
const notice = { hidden: true, textContent: '', innerHTML: '', replaceChildren(...children) { this.children = children; this.textContent = children.map(c => c.textContent).join(''); } };
const address = { value: '' };
const context = {
  window: {}, sessionStorage: { setItem() {} },
  document: {
    getElementById: id => id === 'speed-auto-address-notice' ? notice : address,
    querySelectorAll: () => [],
    createElement: () => ({ textContent: '' }),
    createTextNode: text => ({ textContent: text }),
  },
};
vm.createContext(context);
vm.runInContext(source.slice(0, source.indexOf('/**')), context);
const malicious = '<img src=x onerror="alert(1)">';
context.window.autoFillInstallationAddress(malicious, true);
assert.equal(notice.innerHTML, '', 'Untrusted location was inserted as HTML');
assert.ok(notice.textContent.includes(malicious));
assert.ok(notice.textContent.includes('Ước tính'), 'GeoIP must not claim an exact address');
console.log('Autofill uses plain text and labels estimated location');
