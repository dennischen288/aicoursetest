(()=>{
  'use strict';
  const config=window.ZHIJIAO_CHECKOUT_CONFIG||{};
  const PENDING='zhijiao-pending-order-v1';
  let active=false,memoryPending=null;
  function isConfigured(){
    try{const url=new URL(config.endpoint);return config.enabled===true&&url.origin==='https://script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)&&!url.search&&!url.hash;}catch{return false;}
  }
  function randomId(){const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
  async function fingerprint(order){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(order)));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
  function readPending(){try{return JSON.parse(sessionStorage.getItem(PENDING))||memoryPending}catch{return memoryPending}}
  function savePending(value){memoryPending=value;try{sessionStorage.setItem(PENDING,JSON.stringify(value))}catch{}}
  function clearPending(){memoryPending=null;try{sessionStorage.removeItem(PENDING)}catch{}}
  function trustedOrigin(origin){try{const u=new URL(origin);return u.protocol==='https:'&&(u.hostname==='script.google.com'||/^[a-z0-9-]+\.googleusercontent\.com$/.test(u.hostname));}catch{return false;}}
  async function submit(order){
    if(!isConfigured())throw new Error('線上送單尚未開放，請稍後再試。');
    if(!navigator.onLine)throw new Error('目前沒有網路連線，購物車已保留，請連線後再送出。');
    if(active)throw new Error('訂單正在送出，請稍候。');
    active=true;
    try{
      const normalized={version:1,storeId:config.storeId||'main',customer:order.customer,fulfillment:order.fulfillment,items:order.items.map(item=>({id:item.id,quantity:item.quantity})),expectedTotal:order.expectedTotal};
      const hash=await fingerprint(normalized),previous=readPending();
      const requestId=previous&&previous.fingerprint===hash&&/^[a-f0-9]{32}$/.test(previous.requestId)?previous.requestId:randomId();
      savePending({requestId,fingerprint:hash});
      const nonce=randomId();
      return await new Promise((resolve,reject)=>{
        const frame=document.createElement('iframe'),form=document.createElement('form');
        frame.name='zhijiao_order_'+nonce;frame.title='訂單送出結果';frame.hidden=true;
        form.method='POST';form.action=config.endpoint;form.target=frame.name;form.hidden=true;
        const data={payload:JSON.stringify({...normalized,requestId}),nonce,website:order.website||''};
        for(const [name,value]of Object.entries(data)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input)}
        let timer;
        function cleanup(){clearTimeout(timer);window.removeEventListener('message',onMessage);frame.remove();form.remove()}
        function fail(message){cleanup();reject(new Error(message))}
        function onMessage(event){
          const result=event.data;
          // GAS adds a nested sandbox iframe, so source equality is not reliable.
          // A fresh 128-bit nonce, request ID and Google HTTPS origin bind this receipt.
          if(!trustedOrigin(event.origin)||!result||result.channel!=='zhijiao-order-v1'||result.nonce!==nonce||result.requestId!==requestId)return;
          if(result.ok!==true){if(result.code==='PRICE_CHANGED')clearPending();fail(result.message||'訂單未完成，請稍後再試。');return;}
          if(!/^ZJ-\d{8}-[A-F0-9]{16}$/.test(result.orderId)||!Number.isSafeInteger(result.total)||result.total!==normalized.expectedTotal){fail('訂單回覆驗證失敗。請勿更改購物車後重送，請聯絡店家確認。');return;}
          cleanup();clearPending();resolve({orderId:result.orderId,total:result.total,status:'待確認',paymentStatus:'未付款'});
        }
        window.addEventListener('message',onMessage);
        timer=setTimeout(()=>fail('尚未收到店家確認。購物車已保留；保持相同內容重試可避免重複建單，或聯絡店家確認。'),45000);
        document.body.append(frame,form);
        try{form.submit()}catch{fail('無法送出訂單，請確認網路連線後再試。')}
      });
    }finally{active=false;}
  }
  window.ZhijiaoCheckout=Object.freeze({isConfigured,submit});
})();
