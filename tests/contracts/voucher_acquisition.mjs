import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync('src/pagefpt/static/js/client/voucher_acquisition.js','utf8');
function fixture({preview=false,marker='offer-a',voucher=null}={}){
 const listeners={},elements={},history=[],opened=[];
 class Element{
  constructor(){this.hidden=false;this.open=false;this.textContent='';this.children=[];this.dataset={};this.events={};}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}setAttribute(k,v){this[k]=v;}
  addEventListener(n,fn){this.events[n]=fn;}showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}focus(){this.focused=true;}
 }
 const ids=['voucher-acquisition','voucher-acquisition-title','voucher-acquisition-label','voucher-acquisition-benefits','voucher-acquisition-code','voucher-acquisition-end','voucher-acquisition-terms','voucher-acquisition-use','voucher-acquisition-close','voucher-acquisition-later','voucher-acquisition-reminder','voucher-acquisition-reminder-label','form-voucher-summary','lead-phone'];
 for(const id of ids)elements[id]=new Element();elements['voucher-acquisition'].hidden=false;
 const window={location:{href:'https://example.test/?pf_offer='+marker},history:{state:{kept:true},replaceState:(_s,_t,u)=>history.push(String(u))},
 PageFPTVoucher:{current:()=>voucher},addEventListener:(n,fn)=>listeners[n]=fn};
 const document={getElementById:id=>elements[id]||null,createElement:()=>new Element(),querySelector:()=>null,body:{dataset:{},style:{}},activeElement:null};
 const context=vm.createContext({window,document,URL,Date,Math,JSON,analyticsPreview:()=>preview,
 openBottomSheet:(...args)=>opened.push(args),setInterval:()=>1,clearInterval:()=>{},CustomEvent:class{},requestAnimationFrame:fn=>fn()});
 vm.runInContext(script,context);
 return {elements,listeners,history,opened,change:data=>{voucher=data;listeners['pagefpt-voucher-change']?.();},window};
}
const live={id:'id-a',name:'Tên <script>bad()</script>',label:'Giảm giá theo khu vực',code:'OFFER_A',status:'active',start:'2020-01-01T00:00:00Z',end:'2099-01-01T00:00:00Z',sold_out:false,terms:'Điều kiện <img> chỉ là văn bản',link:{slug:'offer-a'},benefits:[{amount:100000,discount_kind:'fixed',basis:'initial',region_name:'Toàn quốc'}]};
const f=fixture();f.change(live);
assert.equal(f.elements['voucher-acquisition'].open,true);
assert.ok(f.elements['voucher-acquisition-title'].textContent.includes('Chúc mừng'));
assert.equal(f.elements['voucher-acquisition-label'].textContent,live.name);
assert.ok(!f.history[0].includes('pf_offer'));
f.elements['voucher-acquisition-use'].events.click();
assert.equal(f.elements['voucher-acquisition'].open,false);assert.equal(f.opened.length,1);
assert.ok(f.elements['form-voucher-summary'].textContent.includes('OFFER_A'));
assert.equal(f.elements['voucher-acquisition-reminder'].hidden,false);
f.elements['voucher-acquisition-reminder'].events.click();assert.equal(f.elements['voucher-acquisition'].open,true);
f.listeners['pagefpt:lead-accepted']();assert.equal(f.elements['voucher-acquisition-reminder'].hidden,true);
const unavailable=fixture();unavailable.change(null);
assert.equal(unavailable.elements['voucher-acquisition'].open,true);
assert.ok(!unavailable.elements['voucher-acquisition-title'].textContent.includes('Chúc mừng'));
unavailable.elements['voucher-acquisition-use'].events.click();assert.equal(unavailable.opened.length,1);
assert.equal(unavailable.elements['form-voucher-summary'].hidden,true);
const mismatch=fixture();mismatch.change({...live,link:{slug:'different'}});
assert.ok(!mismatch.elements['voucher-acquisition-title'].textContent.includes('Chúc mừng'));
const p=fixture({preview:true});p.change(live);assert.equal(p.elements['voucher-acquisition'].open,false);
console.log('Voucher acquisition: live, unavailable, source match, form context, completion and preview passed');

const capped=fixture();capped.change({...live,benefits:[{amount:100000,cap_vnd:50000,discount_kind:'fixed',basis:'initial',region_name:'Toàn quốc'}]});
assert.ok(capped.elements['voucher-acquisition-benefits'].children[0].textContent.includes('50.000đ'),'Fixed cap must match the pricing engine');
