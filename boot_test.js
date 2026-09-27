const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const errs=[];
const dom=new JSDOM(html,{runScripts:'dangerously',url:'http://localhost/',pretendToBeVisual:true,
  beforeParse(w){w.addEventListener('error',e=>errs.push('window: '+(e.error&&e.error.stack||e.message)))}});
const w=dom.window,d=w.document;
setTimeout(()=>{
  try{
    console.log('boot errors:',errs.length?errs.join('\n'):'NONE');
    const MA=w.__MA__;
    if(!MA){console.log('NO __MA__ hook');process.exit(1)}
    console.log('decks:',MA.S.decks.length,'cards:',MA.S.cards.length);
    // route through all views
    for(const h of ['#home','#calendar','#gen','#tutor','#stats','#settings']){
      errs.length=0;w.location.hash=h;w.dispatchEvent(new w.HashChangeEvent('hashchange'));
      console.log(h,'->',(d.getElementById('main').textContent||'').slice(0,40).replace(/\n/g,' '),'| err:',errs.join('; ')||'ok');
    }
    // study flow
    errs.length=0;w.location.hash='#study/all';w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    console.log('study boot err:',errs.join('; ')||'ok','ST?',!!MA.ST,'q len',MA.ST&&MA.ST.q.length);
    MA.ACT.reveal();MA.ACT.grade({g:3});MA.ACT.reveal();MA.ACT.grade({g:1});
    console.log('grade ok, done=',MA.ST&&MA.ST.done,'err:',errs.join('; ')||'ok');
    // deck page + filters + bulk
    const dk=MA.S.decks[0].id;w.location.hash='#deck/'+dk;w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    console.log('deck view err:',errs.join('; ')||'ok');
    MA.ACT.dfilter({v:''});MA.ACT.dstar();MA.ACT.cPage({p:'1'});MA.ACT.toggleStar({id:MA.S.cards[0].id});
    console.log('filters err:',errs.join('; ')||'ok');
    MA.ACT.theme();MA.ACT.revMode();
    // search modal
    MA.ACT.gsearch();console.log('search modal open:',d.getElementById('modalBg').classList.contains('show'));
    MA.ACT.close();
    MA.ACT.help();MA.ACT.close();
    console.log('final errs:',errs.join('; ')||'ok');
  }catch(e){console.log('TEST EXC:',e.stack)}
},300);
