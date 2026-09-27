const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
  beforeParse(w){w.addEventListener('error',e=>errs.push('W: '+(e.error&&e.error.message||e.message)))}});
const w=dom.window,d=w.document;
const MA=()=>w.__MA__;
const click=el=>{el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))};
let pass=0,fail=0;
const ok=(name,cond)=>{if(cond){pass++;console.log('PASS',name)}else{fail++;console.log('FAIL',name)}};

setTimeout(async()=>{
try{
  // 1. 실제 DOM 클릭으로 학습 진행 (flash)
  w.location.hash='#study/all';w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await new Promise(r=>setTimeout(r,50));
  let btn=d.querySelector('[data-act="reveal"]');ok('reveal button exists',!!btn);
  click(btn);await new Promise(r=>setTimeout(r,30));
  ok('answer shown after click',!!d.querySelector('.ans'));
  const gb=[...d.querySelectorAll('[data-act="grade"]')];ok('grade buttons rendered',gb.length===4);
  click(gb[2]);await new Promise(r=>setTimeout(r,30));
  ok('advanced to next card',MA().ST.done===1);

  // 2. quiz mode via UI
  const qb=[...d.querySelectorAll('[data-act="mode"]')].find(x=>x.dataset.v==='quiz');click(qb);
  await new Promise(r=>setTimeout(r,30));
  const ch=d.querySelectorAll('[data-act="pick"]');ok('quiz choices rendered',ch.length>=2);
  click(ch[0]);await new Promise(r=>setTimeout(r,30));
  ok('quiz pick shows result',!!d.querySelector('.choice.ok')||!!d.querySelector('.choice.no'));

  // 3. type mode + checkType
  const tb=[...d.querySelectorAll('[data-act="mode"]')].find(x=>x.dataset.v==='type');click(tb);
  await new Promise(r=>setTimeout(r,30));
  const inp=d.getElementById('typeIn');ok('type input present',!!inp);
  if(inp){inp.value='테스트답';click(d.querySelector('[data-act="checkType"]'));await new Promise(r=>setTimeout(r,30));
    ok('typed answer graded',MA().ST.show===true);}

  // 4. skipCard at last index then finish
  while(MA().ST){MA().ACT.skipCard();await new Promise(r=>setTimeout(r,5));}
  ok('skip empties queue -> ST null & done screen',!MA().ST&&/학습 완료|없어요/.test(d.getElementById('main').textContent));

  // 5. deck page checkbox selection -> bulk bar -> bulkDel confirm stub
  w.__origConfirm=w.confirm;w.confirm=()=>true;
  const dk=MA().S.decks[0].id;w.location.hash='#deck/'+dk;w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await new Promise(r=>setTimeout(r,30));
  const cbs=[...d.querySelectorAll('[data-csel]')];ok('card checkboxes exist',cbs.length>0);
  cbs.slice(0,2).forEach(cb=>{cb.checked=true;cb.dispatchEvent(new w.Event('change',{bubbles:true}))});
  await new Promise(r=>setTimeout(r,20));
  const bar=d.getElementById('selBar')||d.querySelector('[data-act="bulkDel"]');
  ok('selection bar appears',!!d.querySelector('[data-act="bulkDel"]'));
  const nBefore=MA().S.cards.filter(c=>c.deck===dk).length;
  click(d.querySelector('[data-act="bulkDel"]'));await new Promise(r=>setTimeout(r,30));
  ok('bulk delete removed 2 cards',MA().S.cards.filter(c=>c.deck===dk).length===nBefore-2);

  // 6. study a deck, delete deck mid-study, grade safety
  w.location.hash='#study/all';w.dispatchEvent(new w.HashChangeEvent('hashchange'));
  await new Promise(r=>setTimeout(r,30));
  const delId=MA().S.decks[1]?MA().S.decks[1].id:null;if(!delId)throw new Error('no second deck');
  MA().ACT.reveal();
  MA().ACT.delDeck({id:delId});await new Promise(r=>setTimeout(r,30));
  ok('after deck delete, hash home',w.location.hash==='#home');
  w.location.hash='#study/all';w.dispatchEvent(new w.HashChangeEvent('hashchange'));await new Promise(r=>setTimeout(r,30));
  const qIds=new Set(MA().ST?MA().ST.q:[]);
  ok('deleted deck cards excluded from queue',!MA().S.cards.filter(c=>c.deck===delId).length&&!qIds.size? true : MA().S.cards.filter(c=>qIds.has(c.id)&&c.deck===delId).length===0);

  // 7. persistence across reload (same localStorage in same jsdom? emulate by re-JSDOM with storage copy)
  const stored=w.localStorage.getItem('memoryall');
  const dom2=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,beforeParse(w2){
    w2.addEventListener('error',e=>errs.push('W2: '+e.message));
    w2.localStorage.setItem('memoryall',stored);
  }});
  await new Promise(r=>setTimeout(r,200));
  const S2=dom2.window.__MA__.S;
  ok('reload keeps decks/cards consistent',Array.isArray(S2.decks)&&S2.cards.every(c=>S2.decks.some(dd=>dd.id===c.deck)));
  ok('deleted deck stays deleted after reload',!S2.decks.some(x=>x.id===delId)&&!S2.cards.some(c=>c.deck===delId));
  dom2.window.close();

  // 8. import paste flow
  w.confirm=()=>true;
  MA().ACT.import({id:''});await new Promise(r=>setTimeout(r,30));
  d.getElementById('imText').value='apple,사과,I ate an apple.\n{{서울}}은 한국의 수도다.';
  click(d.querySelector('[data-act="doImport"]'));await new Promise(r=>setTimeout(r,30));
  ok('import created 2 cards',MA().S.cards.filter(c=>c.front==='apple'||/서울/.test(c.front)).length===2);

  // 9. saveCard validation cloze
  MA().ACT.addCard({id:MA().S.decks[0].id});await new Promise(r=>setTimeout(r,30));
  d.getElementById('cType').value='cloze';d.getElementById('cFront').value='정답 없음';
  click(d.querySelector('[data-act="saveCard"]'));await new Promise(r=>setTimeout(r,20));
  ok('cloze without {{}} rejected (modal still open)',d.getElementById('modalBg').classList.contains('show'));
  d.getElementById('cFront').value='이 도시는 {{서울}}이다';
  click(d.querySelector('[data-act="saveCard"]'));await new Promise(r=>setTimeout(r,20));
  ok('valid cloze saved',MA().S.cards.some(c=>c.front==='이 도시는 {{서울}}이다'));
  MA().ACT.close();

  // 10. XSS attempts through data paths
  const xssName='<img src=x onerror=alert(1)>';
  MA().ACT.newDeck();await new Promise(r=>setTimeout(r,20));
  d.getElementById('dName').value=xssName;click(d.querySelector('[data-act="saveDeck"]'));
  await new Promise(r=>setTimeout(r,30));
  ok('deck name XSS neutralized',!d.getElementById('main').innerHTML.includes('<img src=x'));
  ok('deck name preserved as text',MA().S.decks.some(x=>x.name===xssName));

  // 11. keyboard shortcut F flips
  w.location.hash='#study/all';w.dispatchEvent(new w.HashChangeEvent('hashchange'));await new Promise(r=>setTimeout(r,30));
  const rev0=MA().S.settings.reversed;
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'f',code:'KeyF',bubbles:true}));
  await new Promise(r=>setTimeout(r,20));
  ok('F toggles reversed',MA().S.settings.reversed!==rev0);

  // 12. Esc closes modal
  MA().ACT.gsearch();await new Promise(r=>setTimeout(r,20));
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await new Promise(r=>setTimeout(r,20));
  ok('Esc closes modal',!d.getElementById('modalBg').classList.contains('show'));

}catch(e){fail++;console.log('EXC',e.stack)}
console.log(`\nRESULT pass=${pass} fail=${fail} windowErrors=${errs.length}`);
if(errs.length)console.log(errs.slice(0,5).join('\n'));
process.exit(fail?1:0);
},300);
