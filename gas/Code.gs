/** 炙餃訂單接收端。部署為網頁應用程式：以擁有者執行、任何人可存取。
 * 此端點只接收訂單，不提供任何顧客資料的公開查詢。
 * 執行 setup() 新建試算表；確認價格與門市後，執行 enableOrders()。
 */
const ORDER_HEADERS=['訂單編號','建立時間','接單狀態','付款狀態','門市代碼','取餐方式','姓名','電話','備註','品項摘要','總數量','總金額','品項JSON','請求ID','內容雜湊'];
const PRODUCT_HEADERS=['商品代碼','商品名稱','單價','上架'];
const DEFAULT_PRODUCTS=[['p01','經典鮮肉鍋貼',85,true],['p02','香辣椒麻鍋貼',95,true],['p03','韭香鮮肉鍋貼',90,true],['d01','鮮肉高麗菜水餃',90,true],['d02','韭菜鮮肉水餃',95,true],['s01','酸辣湯',45,true],['s02','玉米濃湯',45,true],['s03','古早味紅茶',30,true],['a01','涼拌小黃瓜',45,true],['a02','秘製滷豆干',40,true],['gift01','招財鍋貼禮盒 50 入',599,true]];
function props_(){return PropertiesService.getScriptProperties();}
function assert_(condition,message,code){if(!condition){const error=new Error(message);error.code=code||'INVALID_ORDER';throw error;}}
function text_(value,max,required){assert_(typeof value==='string','表單資料格式不正確。');const result=value.trim();assert_(result.length<=max&&(!required||result.length>0),'請確認必填欄位及字數。');assert_(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(result),'資料含有不支援的字元。');return result;}
function sheetText_(value){return /^[\s]*[=+\-@]/.test(value)?"'"+value:value;}
function hash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(b=>((b+256)%256).toString(16).padStart(2,'0')).join('');}
function setup(){
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    const p=props_();let id=p.getProperty('SPREADSHEET_ID');
    const book=id?SpreadsheetApp.openById(id):SpreadsheetApp.create('炙餃｜訂單管理');
    if(!id){id=book.getId();p.setProperty('SPREADSHEET_ID',id)}
    const orders=book.getSheetByName('訂單')||book.insertSheet('訂單');
    if(orders.getLastRow()===0){orders.appendRow(ORDER_HEADERS);orders.setFrozenRows(1);orders.getRange(1,1,1,ORDER_HEADERS.length).setFontWeight('bold');orders.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm:ss');orders.getRange('H:H').setNumberFormat('@');orders.getRange('G:I').setWrap(true);orders.getRange('J:J').setWrap(true);orders.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['待確認','已確認','製作中','已完成','已取消'],true).build());orders.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['未付款','已付款','已退款'],true).build());}
    const products=book.getSheetByName('商品')||book.insertSheet('商品');
    if(products.getLastRow()===0){products.appendRow(PRODUCT_HEADERS);products.getRange(2,4,DEFAULT_PRODUCTS.length,1).insertCheckboxes();products.getRange(2,1,DEFAULT_PRODUCTS.length,4).setValues(DEFAULT_PRODUCTS);products.setFrozenRows(1)}
    const info=book.getSheetByName('使用說明')||book.insertSheet('使用說明');
    if(info.getLastRow()===0)info.getRange(1,1,8,2).setValues([
      ['炙餃訂單管理','第一版：外帶／內用，店家確認後付款'],['訂單狀態','在「訂單」C 欄更新；D 欄記錄付款狀態。'],['商品價格','在「商品」修改，並同步網站售價；目前為示範價格。'],['門市','第一版門市代碼 main；正式營業前確認門市資訊。'],['啟用接單','確認價格、門市及隱私資訊後，在 GAS 執行 enableOrders()。'],['暫停接單','在 GAS 執行 disableOrders()。'],['資料權限','試算表維持私人，只分享給需要處理訂單的人員。'],['付款','此系統不處理信用卡、不自動扣款、不等同店家已接單。']
    ]);
    if(!p.getProperty('SITE_ORIGIN'))p.setProperty('SITE_ORIGIN','https://dennischen288.github.io');
    if(!p.getProperty('ORDERS_ENABLED'))p.setProperty('ORDERS_ENABLED','false');
    book.setSpreadsheetTimeZone('Asia/Taipei');SpreadsheetApp.flush();
    console.log('試算表已就緒：'+book.getUrl());return book.getUrl();
  }finally{lock.releaseLock()}
}
function enableOrders(){assert_(props_().getProperty('SPREADSHEET_ID'),'請先執行 setup()。');props_().setProperty('ORDERS_ENABLED','true');}
function disableOrders(){props_().setProperty('ORDERS_ENABLED','false');}
function loadCatalog_(book){
  const sheet=book.getSheetByName('商品');assert_(sheet&&sheet.getLastRow()>1,'商品設定尚未就緒。','NOT_READY');
  const catalog=Object.create(null);
  sheet.getRange(2,1,sheet.getLastRow()-1,4).getValues().forEach(row=>{if(row[3]===true||row[3]==='TRUE'){const price=Number(row[2]);assert_(Number.isSafeInteger(price)&&price>0,'商品價格設定不正確。','NOT_READY');catalog[String(row[0])]={name:String(row[1]),price};}});return catalog;
}
function validateOrder_(raw,catalog){
  assert_(raw&&raw.version===1,'訂單版本不正確。');
  assert_(/^[a-f0-9]{32}$/.test(raw.requestId||''),'訂單識別碼不正確。');
  assert_(raw.storeId==='main','門市資料不正確。');
  assert_(['外帶','內用'].includes(raw.fulfillment),'目前僅接受外帶與內用。');
  assert_(raw.customer&&typeof raw.customer==='object','請填寫聯絡資料。');
  const name=text_(raw.customer.name,60,true),phone=text_(raw.customer.phone,20,true),note=text_(raw.customer.note,300,false);
  assert_(/^[0-9+() -]{8,20}$/.test(phone),'請填寫有效的聯絡電話。');
  assert_(Array.isArray(raw.items)&&raw.items.length>0&&raw.items.length<=20,'請確認購物車品項。');
  const seen=Object.create(null);let total=0,quantity=0;
  const items=raw.items.map(item=>{
    assert_(item&&typeof item.id==='string'&&/^[a-z0-9]{1,20}$/.test(item.id)&&!seen[item.id],'商品資料不正確。');seen[item.id]=true;
    const product=catalog[item.id];assert_(product,'部分商品已下架，請重新整理後再送出。','PRODUCT_CHANGED');
    assert_(Number.isInteger(item.quantity)&&item.quantity>=1&&item.quantity<=99,'商品數量須為 1 至 99。');
    total+=product.price*item.quantity;quantity+=item.quantity;
    return {id:item.id,name:product.name,quantity:item.quantity,unitPrice:product.price,subtotal:product.price*item.quantity};
  });
  assert_(total<=50000&&quantity<=300,'單筆訂單超過上限，請聯絡店家。');
  assert_(Number.isSafeInteger(raw.expectedTotal)&&raw.expectedTotal===total,'商品價格已更新，請重新整理頁面後確認金額再送出。','PRICE_CHANGED');
  const normalized={storeId:'main',fulfillment:raw.fulfillment,customer:{name,phone,note},items:items.map(item=>({id:item.id,quantity:item.quantity})),expectedTotal:total};
  return {...normalized,requestId:raw.requestId,total,quantity,pricedItems:items,digest:hash_(JSON.stringify(normalized))};
}
function recordOrder_(raw){
  const p=props_();assert_(p.getProperty('ORDERS_ENABLED')==='true','店家目前暫停接單，請稍後再試。','CLOSED');
  assert_(p.getProperty('SPREADSHEET_ID'),'訂單系統尚未設定完成。','NOT_READY');
  const lock=LockService.getScriptLock();assert_(lock.tryLock(15000),'目前訂單較多，請稍後以相同內容重試。','BUSY');
  try{
    const book=SpreadsheetApp.openById(p.getProperty('SPREADSHEET_ID')),orders=book.getSheetByName('訂單');
    assert_(orders&&orders.getLastRow()>=1,'訂單系統尚未設定完成。','NOT_READY');
    // A committed request can be retried even if the price changes afterwards.
    if(raw&&/^[a-f0-9]{32}$/.test(raw.requestId||'')&&orders.getLastRow()>1){
      const cell=orders.getRange(2,14,orders.getLastRow()-1,1).createTextFinder(raw.requestId).matchEntireCell(true).findNext();
      if(cell){const row=orders.getRange(cell.getRow(),1,1,ORDER_HEADERS.length).getValues()[0];
        const originalItems=JSON.parse(row[12]);const oldCatalog=Object.create(null);originalItems.forEach(item=>{oldCatalog[item.id]={name:item.name,price:item.unitPrice}});
        const retry=validateOrder_(raw,oldCatalog);assert_(retry.digest===row[14],'此訂單內容已變更，請重新確認後再送出。','REQUEST_CONFLICT');
        return {ok:true,orderId:String(row[0]),total:Number(row[11])};
      }
    }
    const order=validateOrder_(raw,loadCatalog_(book));
    // Bounded global rate control; not a substitute for CAPTCHA on a high-traffic site.
    const cache=CacheService.getScriptCache(),rateKey='orders-minute-'+Math.floor(Date.now()/60000),count=Number(cache.get(rateKey)||0);
    assert_(count<30,'目前訂單較多，請稍後再試。','RATE_LIMIT');cache.put(rateKey,String(count+1),120);
    const now=new Date(),id='ZJ-'+Utilities.formatDate(now,'Asia/Taipei','yyyyMMdd')+'-'+Utilities.getUuid().replace(/-/g,'').slice(0,16).toUpperCase();
    const values=[id,now,'待確認','未付款',order.storeId,order.fulfillment,sheetText_(order.customer.name),sheetText_(order.customer.phone),sheetText_(order.customer.note),sheetText_(order.pricedItems.map(item=>item.name+' × '+item.quantity).join('；')),order.quantity,order.total,JSON.stringify(order.pricedItems),order.requestId,order.digest];
    orders.getRange(orders.getLastRow()+1,1,1,values.length).setValues([values]);SpreadsheetApp.flush();
    return {ok:true,orderId:id,total:order.total};
  }finally{lock.releaseLock()}
}
function receipt_(receipt,nonce,requestId){
  const origin=props_().getProperty('SITE_ORIGIN')||'https://dennischen288.github.io';
  assert_(/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(origin),'SITE_ORIGIN 設定不正確。','NOT_READY');
  const data=JSON.stringify({channel:'zhijiao-order-v1',nonce,requestId,...receipt}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><p>訂單處理完成，請回原頁面查看結果。</p><script>window.top.postMessage('+data+','+JSON.stringify(origin)+');</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doPost(e){
  let nonce='',requestId='',result;
  try{
    assert_(e&&e.parameter&&typeof e.parameter.payload==='string'&&e.parameter.payload.length<=16000,'訂單資料不正確。');
    nonce=e.parameter.nonce||'';assert_(/^[a-f0-9]{32}$/.test(nonce),'回覆識別碼不正確。');
    assert_(!e.parameter.website,'訂單資料不正確。');
    const raw=JSON.parse(e.parameter.payload);requestId=raw.requestId||'';
    result=recordOrder_(raw);
  }catch(error){
    const known=['INVALID_ORDER','NOT_READY','CLOSED','BUSY','PRODUCT_CHANGED','PRICE_CHANGED','REQUEST_CONFLICT','RATE_LIMIT'].includes(error.code);
    // Never log customer payloads or reflect internal errors into the public response.
    result={ok:false,code:known?error.code:'SERVER_ERROR',message:known?error.message:'系統暫時無法確認訂單，請保留購物車並稍後重試。'};
  }
  return receipt_(result,nonce,requestId);
}
function doGet(){return ContentService.createTextOutput(JSON.stringify({service:'zhijiao-orders',version:1,acceptingOrders:props_().getProperty('ORDERS_ENABLED')==='true'})).setMimeType(ContentService.MimeType.JSON);}
