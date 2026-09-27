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
  // orphan card + bad log — 시나리오1: 삭제 이력 없는 유령 덱 참조 카드는 기본 덱으로 회송(유실 방지)
  const dom3=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',beforeParse(w3){
    w3.addEventListener('error',e=>errs.push('O:'+e.message));
    w3.localStorage.setItem('memoryall',JSON.stringify({decks:[],cards:[{id:'x',front:'고아카드',deck:'ghost'}],log:'notobj',delTomb:{oldgone:1},settings:{goal:-5}}));
  }});await wait(250);
  const S3=dom3.window.__MA__.S;
  ok('orphan card moved to real deck',S3.cards.length===1&&S3.decks.some(x=>x.id===S3.cards[0].deck));
  ok('bad log repaired',typeof S3.log==='object'&&!Array.isArray(S3.log));
  ok('goal clamped from -5',S3.settings.goal>=1);
  // 시나리오2: 삭제 이력(delTomb)이 있는 덱의 카드는 되살리지 않고 제거 (tombstone 우선 원칙)
  const dom3b=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',beforeParse(w3b){
    w3b.addEventListener('error',e=>errs.push('T:'+e.message));
    w3b.localStorage.setItem('memoryall',JSON.stringify({decks:[],cards:[{id:'y',front:'삭제된덱카드',deck:'gone'}],log:{},delTomb:{gone:Date.now()}}));
  }});await wait(250);
  const S3b=dom3b.window.__MA__.S;
  ok('tombstoned cards stay deleted',S3b.cards.filter(c=>c.deck==='gone').length===0&&Object.keys(dom3b.window.__MA__.delTomb).includes('gone'));
  dom3.window.close();dom3b.window.close();
  // hourHeat: 두 저장 형태(시간 목록 / 히스토그램) 모두에서 합계 = 총 복습 횟수
  {const M=MA();const saveLog=JSON.stringify(M.S.log);
   M.S.log={d1:{n:5,ok:4,nw:0,hs:[9,9,14]},d2:{n:3,ok:2,nw:0,hs:(()=>{const a=new Array(24).fill(0);a[9]=2;a[23]=1;return a})()}};
   const htmlOut=M.hourHeat();const sum=[...htmlOut.matchAll(/title="(\d+)시 · (\d+)장"/g)].reduce((acc,m)=>acc+ +m[2],0);
   ok('hourHeat sums list-format hs',sum===6);
   ok('hourHeat handles histogram format',/18|23/.test(htmlOut)&&!/NaN/.test(htmlOut));
   M.S.log=JSON.parse(saveLog);}
  // 알 수 없는 라우트는 홈으로 안전 폴백 (undefined 렌더 없음)
  {const domU=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/#nonsense'});await wait(250);
   ok('unknown route falls back home',!/undefined/.test(domU.window.document.getElementById('main').innerHTML));domU.window.close();}
  dom3.window.close();dom3b.window.close();
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
