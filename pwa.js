(()=>{
  const button=document.getElementById('pwaInstall'),status=document.getElementById('pwaStatus');
  let installPrompt=null;
  const standalone=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  function installed(){button.hidden=true;status.textContent='已安裝，可從主畫面開啟炙餃。'}
  if(standalone())installed();
  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;button.hidden=false;});
  window.addEventListener('appinstalled',()=>{installPrompt=null;installed()});
  button.addEventListener('click',async()=>{
    if(installPrompt){
      const prompt=installPrompt;installPrompt=null;
      try{await prompt.prompt();const choice=await prompt.userChoice;status.textContent=choice.outcome==='accepted'?'已送出安裝，完成後可從主畫面開啟。':'你可以稍後再安裝。'}catch{status.textContent='請使用瀏覽器選單中的「安裝應用程式」或「加入主畫面」。'}
    }else{
      const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
      status.textContent=ios?'請在 Safari 點選「分享」，再選擇「加入主畫面」。':'請開啟瀏覽器選單，選擇「安裝應用程式」或「加入主畫面」。若未顯示，請用 Chrome 或 Edge 開啟本站。';
    }
  });
  function connection(){const offline=!navigator.onLine;document.getElementById('pwaOffline').hidden=!offline;}
  window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{status.textContent='離線功能尚未準備好，請連線後重新開啟網站。'});
    });
  }
})();
