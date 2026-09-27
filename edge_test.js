const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
let pass=0,fail=0;const ok=(n,c)=>{c?(pass++,console.log('PASS',n)):(fail++,console.log('FAIL',n))};
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
  beforeParse(w){w.addEventListener('error',e=>errs.push(e.error&&e.error.message||e.message))}});
const w=dom.window,d=w.document;const MA=()=>w.__MA__;
setTimeout(async()=>{try{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  // corrupted storage boot
  const dom2=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',beforeParse(w2){
    w2.addEventListener('error',e=>errs.push('C:'+e.message));
    w2.localStorage.setItem('memoryall','{broken json!!');
  }});await wait(250);
  ok('boots with corrupted storage',!!dom2.window.__MA__&&dom2.window.__MA__.S.cards.length>0);dom2.window.close();
  // orphan card + bad log (with tombstone so repair path runs)
  const dom3=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',beforeParse(w3){
    w3.addEventListener('error',e=>errs.push('O:'+e.message));
    w3.localStorage.setItem('memoryall',JSON.stringify({decks:[],cards:[{id:'x',front:'고아카드',deck:'ghost'}],log:'notobj',delTomb:{oldgone:1},settings:{goal:-5}}));
  }});await wait(250);
  const S3=dom3.window.__MA__.S;
  ok('orphan card moved to real deck',S3.cards.length===1&&S3.decks.some(x=>x.id===S3.cards[0].deck));
  ok('bad log repaired',typeof S3.log==='object'&&!Array.isArray(S3.log));
  ok('unknown route falls back home',(()=>{dom3.window.location.hash='#nonsense';dom3.window.dispatchEvent(new dom3.window.HashChangeEvent('hashchange'));return !/undefined/.test(dom3.window.document.getElementById('main').innerHTML)})());
  dom3.window.close();
  // study session -> sessions recorded (check same window's storage JSON)
  w.location.hash='#study/all';w.dispatchEvent(new w.HashChangeEvent('hashchange'));await wait(40);
  MA().ACT.reveal();MA().ACT.grade({g:3});await wait(20);
  const qLeft=MA().ST?MA().ST.q.length-MA().ST.i:0;
  while(MA().ST){MA().ACT.skipCard();await wait(3)}   // finish session -> logSession called
  await wait(30);
  const disk=JSON.parse(w.localStorage.getItem('memoryall'));
  ok('sessions recorded on disk after finishing',(disk.sessions&&Object.values(disk.sessions).flat().length>=1));
  const stored=w.localStorage.getItem('memoryall'),stStored=w.localStorage.getItem('memoryall-st');
  const dom4=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',beforeParse(w4){
    w4.addEventListener('error',e=>errs.push('R:'+e.message));
    w4.localStorage.setItem('memoryall',stored);if(stStored)w4.localStorage.setItem('memoryall-st',stStored);
  }});await wait(250);
  ok('reload keeps data intact',dom4.window.__MA__.S.cards.length===disk.cards.length);
  dom4.window.close();
  // XSS in card front rendered in list & study
  const dk=MA().S.decks[0].id;
  MA().ACT.addCard({id:dk});await wait(20);
  d.getElementById('cFront').value='<script>window.__XSS=1<\/script><svg onload=window.__XSS=2>';
  d.getElementById('cBack').value='safeback';
  MA().ACT.saveCard({id:''});await wait(30);
  ok('XSS card stored as text',!w.__XSS);
  w.location.hash='#study/all';w.dispatchEvent(new w.HashChangeEvent('hashchange'));await wait(30);
  let guard=0;while(MA().ST&&guard++<50&&!(MA().curCard()&&String(MA().curCard().front).includes('<script'))){MA().ACT.skipCard();await wait(3)}
  if(MA().ST){MA().ACT.reveal();await wait(20);}
  ok('XSS not executed during study render',!w.__XSS);
}catch(e){fail++;console.log('EXC',e.stack)}
const realErrs=errs.filter(x=>!/scrollTo|canvas/i.test(x));
console.log(`RESULT pass=${pass} fail=${fail} windowErrors=${realErrs.length}`);
realErrs.slice(0,6).forEach(e=>console.log('ERR:',e));
process.exit(fail||realErrs.length?1:0)},400);
