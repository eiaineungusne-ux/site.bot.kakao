const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root=path.join(__dirname,'..');
const code=fs.readFileSync(path.join(root,'assets/status.js'),'utf8').replace(/^export /gm,'');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('public status, safe text rendering and API failure', async () => {
  const dom=new JSDOM(fs.readFileSync(path.join(root,'ventabot/status/index.html'),'utf8'),{url:'https://kakaobot.xyz/ventabot/status/',runScripts:'outside-only'});
  const {window:w}=dom;
  w.AbortSignal=AbortSignal;
  const injection='<img src=x onerror=alert(1)>';
  let fail=false;
  w.fetch=async url=>{
    if(fail) throw Error('네트워크 오류');
    return {ok:true,json:async()=>String(url).includes('status-config')?{apiBase:'https://status.example'}:{
      state:'offline',title:'서버 터짐',message:'복구 중',lastSeen:1000,checkedAt:Date.now(),notice:injection,days:{},
      incidents:[{title:injection,resolvedAt:null,updates:[{at:1000,stage:'investigating',message:injection}]}],
    }};
  };
  try {
    w.eval(code); await flush();
    assert.equal(w.document.getElementById('status-title').textContent,'서버 터짐');
    assert.equal(w.document.querySelectorAll('#history-bars span').length,30);
    assert.equal(w.document.querySelector('#incidents h3').textContent,injection);
    assert.equal(w.document.querySelectorAll('img').length,0);
    fail=true; w.document.getElementById('refresh').click(); await flush();
    assert.equal(w.document.getElementById('status-title').textContent,'상태 확인 불가');
    assert.equal(w.document.getElementById('status-notice').hidden,true);
    assert.equal(w.document.getElementById('refresh').disabled,false);
  } finally { w.close(); }
});
test('administrator can load, publish a notice and clear credentials on logout', async () => {
  const dom=new JSDOM(fs.readFileSync(path.join(root,'admin/status/index.html'),'utf8'),{url:'https://kakaobot.xyz/admin/status/',runScripts:'outside-only'});
  const w=dom.window; w.AbortSignal=AbortSignal; const calls=[];
  w.fetch=async(url,options)=>({ok:true,json:async()=>{
    if(String(url).includes('status-config'))return {apiBase:'https://status.example'};
    const payload=JSON.parse(options.body); calls.push({url:String(url),payload,authorization:options.headers.Authorization});
    if (String(url).endsWith('/login')) return {token:'a'.repeat(64),expiresAt:Date.now()+60000};
    assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(64));
    return {notice:payload.message||'',maintenance:Boolean(payload.enabled),incidents:[]};
  }});
  try {
    let admin=fs.readFileSync(path.join(root,'assets/status-admin.js'),'utf8').replace(/^import .*\n/,'').replace("const $ = id => document.getElementById(id);",'');
    w.eval(code+'\n{'+admin+'}');
    w.document.getElementById('token').value='fake-test-token';
    w.document.getElementById('auth-form').dispatchEvent(new w.Event('submit',{cancelable:true})); await flush();
    assert.equal(calls[0].url,'https://status.example/login');
    assert.equal(calls[1].payload.action,'read');
    assert.equal(w.document.getElementById('admin-panels').hidden,false);
    assert.equal(w.document.getElementById('token').value,'');
    w.document.getElementById('notice').value='점검 안내';
    w.document.getElementById('notice-form').dispatchEvent(new w.Event('submit',{cancelable:true})); await flush();
    assert.deepEqual(calls[2].payload,{action:'notice',message:'점검 안내'});
    w.document.getElementById('maintenance').click(); await flush();
    assert.deepEqual(calls[3].payload,{action:'maintenance',enabled:true});
    w.document.getElementById('logout').click(); await flush();
    assert.equal(w.document.getElementById('admin-panels').hidden,true);
    assert.equal(w.localStorage.length,0);
  } finally {w.close();}
});
