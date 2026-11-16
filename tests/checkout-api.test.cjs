const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const code=fs.readFileSync(require('node:path').join(__dirname,'../checkout-api.js'),'utf8');
const config=fs.readFileSync(require('node:path').join(__dirname,'../checkout-config.js'),'utf8');
function harness(){
 const listeners=new Map(),storage=new Map(),requests=[];let timeout;
 class El{constructor(tag){this.tag=tag;this.children=[]}append(el){this.children.push(el)}remove(){}submit(){requests.push(Object.fromEntries(this.children.map(el=>[el.name,el.value])))}}
 const window={addEventListener:(e,fn)=>listeners.set(e,fn),removeEventListener:e=>listeners.delete(e)};
 const ctx={window,URL,crypto:webcrypto,TextEncoder,navigator:{onLine:true},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{createElement:t=>new El(t),body:{append(){}}},setTimeout:fn=>(timeout=fn,1),clearTimeout(){}};
 vm.createContext(ctx);vm.runInContext(config,ctx);vm.runInContext(code,ctx);
 return {api:window.ZhijiaoCheckout,ctx,requests,storage,timeout:()=>timeout(),reply:(request,extra={},origin='https://n-example-script.googleusercontent.com')=>listeners.get('message')?.({origin,data:{channel:'zhijiao-order-v1',nonce:request.nonce,requestId:JSON.parse(request.payload).requestId,ok:true,orderId:'ZJ-20261116-A1B2C3D4E5F60718',total:170,...extra}})};
}
const order={customer:{name:'測試',phone:'0900000000',note:'不製作'},fulfillment:'外帶',items:[{id:'p01',quantity:2,unitPrice:1}],expectedTotal:170};
const wait=()=>new Promise(resolve=>setTimeout(resolve,5));
(async()=>{
 const h=harness();assert(h.api.isConfigured());
 const first=h.api.submit(order);await wait();const request=h.requests[0];assert(request);assert.equal(JSON.parse(request.payload).items[0].unitPrice,undefined);
 let done=false;first.then(()=>done=true);
 h.reply(request,{},'https://evil.example');await wait();assert(!done);
 h.reply(request,{nonce:'0'.repeat(32)});await wait();assert(!done);
 await assert.rejects(h.api.submit(order),/正在送出/);
 h.reply(request);assert.equal((await first).total,170);assert.equal(h.storage.size,0);
 const timed=h.api.submit(order);await wait();const timedRequest=h.requests[1],rejected=assert.rejects(timed,/尚未收到/);h.timeout();await rejected;
 const retry=h.api.submit(order);await wait();const retryRequest=h.requests[2];assert.equal(JSON.parse(timedRequest.payload).requestId,JSON.parse(retryRequest.payload).requestId);
 h.reply(retryRequest);await retry;
 const closed=h.api.submit(order);await wait();const closedRejected=assert.rejects(closed,/暫停接單/);h.reply(h.requests[3],{ok:false,code:'CLOSED',message:'店家目前暫停接單'});await closedRejected;
 const mismatch=h.api.submit(order);await wait();const mismatchRejected=assert.rejects(mismatch,/驗證失敗/);h.reply(h.requests[4],{total:1});await mismatchRejected;
 h.ctx.navigator.onLine=false;await assert.rejects(h.api.submit(order),/沒有網路/);assert.equal(h.requests.length,5);
 assert(![...h.storage.values()].some(value=>value.includes('0900000000')));
 console.log('PASS: GAS form payload, receipt origin/nonce validation, duplicate submit guard, confirmed total, timeout idempotence, closed/offline errors, no raw PII in session storage.');
})().catch(error=>{console.error(error);process.exitCode=1});
