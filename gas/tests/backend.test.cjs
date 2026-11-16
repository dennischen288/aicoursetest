const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const properties=new Map(),cache=new Map();let created=0,locked=false;
class Range{
 constructor(sheet,row,col,n=1,m=1){Object.assign(this,{sheet,row,col,n,m})}
 setValues(values){values.forEach((line,i)=>line.forEach((v,j)=>{this.sheet.rows[this.row-1+i]??=[];this.sheet.rows[this.row-1+i][this.col-1+j]=v}));return this}
 getValues(){return Array.from({length:this.n},(_,i)=>Array.from({length:this.m},(_,j)=>this.sheet.rows[this.row-1+i]?.[this.col-1+j]??''))}
 setFontWeight(){return this}setNumberFormat(){return this}setWrap(){return this}setDataValidation(){return this}
 insertCheckboxes(){for(let i=0;i<this.n;i++){this.sheet.rows[this.row-1+i]??=[];this.sheet.rows[this.row-1+i][this.col-1]=false}return this}
 createTextFinder(query){const range=this;return {matchEntireCell(){return this},findNext(){const data=range.getValues(),i=data.findIndex(row=>row[0]===query);return i<0?null:{getRow:()=>range.row+i}}}}
}
class Sheet{constructor(){this.rows=[]}getLastRow(){return this.rows.length}appendRow(row){this.rows.push(row)}setFrozenRows(){}getRange(row,col,n,m){if(typeof row==='string')return new Range(this,1,1);return new Range(this,row,col,n,m)}}
const sheets=new Map(),book={getId:()=> 'fake-sheet-id',getUrl:()=> 'https://docs.google.com/spreadsheets/d/fake-sheet-id/edit',getSheetByName:name=>sheets.get(name),insertSheet:name=>{const sheet=new Sheet();sheets.set(name,sheet);return sheet},setSpreadsheetTimeZone(){}};
const html=[];
const ctx={console:{log(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v)})},LockService:{getScriptLock:()=>({waitLock(){assert(!locked);locked=true},tryLock(){assert(!locked);locked=true;return true},releaseLock(){locked=false}})},SpreadsheetApp:{create(){created++;return book},openById:()=>book,flush(){},newDataValidation:()=>({requireValueInList(){return this},build(){return {}}})},CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v)})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(value).digest()],getUuid:()=>crypto.randomUUID(),formatDate:()=> '20261116'},HtmlService:{XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createHtmlOutput:value=>({setXFrameOptionsMode(){html.push(value);return value}})},ContentService:{MimeType:{JSON:'JSON'},createTextOutput:value=>({setMimeType(){return value}})}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../Code.gs'),'utf8'),ctx);
ctx.setup();ctx.setup();assert.equal(created,1);assert.equal(sheets.get('商品').rows[1][3],true);assert.equal(properties.get('ORDERS_ENABLED'),'false');
ctx.enableOrders();const raw={version:1,requestId:'a'.repeat(32),storeId:'main',fulfillment:'外帶',customer:{name:'=IMPORTXML("bad")',phone:'0900000000',note:'測試勿製作'},items:[{id:'p01',quantity:2}],expectedTotal:170};
const response=ctx.recordOrder_(raw);assert.equal(response.total,170);const orders=sheets.get('訂單');assert.equal(orders.rows.length,2);assert.equal(orders.rows[1][2],'待確認');assert.equal(orders.rows[1][3],'未付款');assert.equal(orders.rows[1][6][0],"'");
const repeated=ctx.recordOrder_(raw);assert.equal(repeated.orderId,response.orderId);assert.equal(orders.rows.length,2);
sheets.get('商品').rows[1][2]=100;assert.equal(ctx.recordOrder_(raw).orderId,response.orderId);
const next=extra=>({...raw,requestId:crypto.randomBytes(16).toString('hex'),...extra});
assert.throws(()=>ctx.recordOrder_(next({expectedTotal:1})),e=>e.code==='PRICE_CHANGED');
assert.throws(()=>ctx.recordOrder_(next({fulfillment:'宅配'})),e=>e.code==='INVALID_ORDER');
assert.throws(()=>ctx.recordOrder_(next({items:[{id:'p01',quantity:-1}]})),e=>e.code==='INVALID_ORDER');
assert.throws(()=>ctx.recordOrder_(next({items:[{id:'missing',quantity:1}]})),e=>e.code==='PRODUCT_CHANGED');
assert.throws(()=>ctx.recordOrder_({...raw,customer:{...raw.customer,name:'changed'}}),e=>e.code==='REQUEST_CONFLICT');
assert.equal(orders.rows.length,2);
const message=ctx.doPost({parameter:{payload:JSON.stringify(raw),nonce:'b'.repeat(32),website:''}});assert(message.includes('window.top.postMessage'));assert(message.includes('https://dennischen288.github.io'));assert(!message.includes('0900000000'));assert(!message.includes('IMPORTXML'));
ctx.disableOrders();assert.throws(()=>ctx.recordOrder_(next()),e=>e.code==='CLOSED');assert.equal(locked,false);
assert(JSON.parse(ctx.doGet()).acceptingOrders===false);
console.log('PASS: setup idempotence, enabled catalog, private receipt, server pricing, duplicate retry after price change, formula protection, reject tampering/delivery/invalid quantities, pause ordering.');
