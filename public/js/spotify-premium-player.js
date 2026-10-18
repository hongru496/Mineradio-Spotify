/* Optional Spotify Premium player. Playback is handled by Spotify's official SDK. */
(() => {
  'use strict';
  let player = null, deviceId = '', connected = false, latest = null;
  const css = document.createElement('style');
  css.textContent = `#sp-premium-open{position:fixed;right:18px;bottom:84px;z-index:2147483000;background:#1db954;color:#07190c;border:0;border-radius:22px;padding:11px 16px;cursor:pointer;font-weight:700}#sp-premium-panel{position:fixed;right:18px;bottom:135px;width:min(360px,calc(100vw - 36px));background:#131b19;color:#fff;border:1px solid #38674e;border-radius:16px;padding:18px;z-index:2147483000;box-shadow:0 16px 50px #0009;font:14px system-ui}#sp-premium-panel[hidden]{display:none}#sp-premium-panel input{box-sizing:border-box;width:100%;padding:10px;border-radius:8px;border:1px solid #577060;background:#101614;color:white}#sp-premium-panel button{padding:9px 12px;margin:5px 3px 5px 0;border:0;border-radius:8px;cursor:pointer}#sp-premium-status{margin:10px 0;overflow-wrap:anywhere;color:#bce3c9}#sp-premium-panel img{height:48px;width:48px;object-fit:cover;border-radius:5px;vertical-align:middle;margin-right:10px}`;
  document.head.appendChild(css);
  const open = document.createElement('button'); open.id = 'sp-premium-open'; open.textContent = '♫ Spotify Premium';
  const panel = document.createElement('section'); panel.id = 'sp-premium-panel'; panel.hidden = true;
  panel.innerHTML = `<strong>Spotify Premium · MineRadio</strong><button id="sp-close" style="float:right">×</button><p id="sp-premium-status">请先在 MineRadio 登录 Spotify。</p><div><label for="sp-client-id">Spotify Client ID</label><input id="sp-client-id" placeholder="输入 Spotify Developer Client ID" value="46a8977ed0b7401bb1529669a8ef74e4" autocomplete="off"><button id="sp-login" style="background:#1db954;color:#07190c;font-weight:700">保存 Client ID 并登录 Spotify</button></div><div id="sp-current"></div><input id="sp-uri" placeholder="粘贴 Spotify 歌曲链接或 spotify:track:URI" aria-label="Spotify 歌曲链接"><div><button id="sp-connect">连接播放器</button><button id="sp-play">播放链接</button></div><div><button id="sp-prev">⏮</button><button id="sp-toggle">⏯</button><button id="sp-next">⏭</button></div><small>仅支持 Premium；受 Spotify SDK、DRM 和开发者权限限制。原有播放器仍可使用。</small>`;
  document.body.append(open, panel);
  const $ = id => document.getElementById(id);
  const status = message => { $('sp-premium-status').textContent = message; };
  const token = async () => {
    const res = await fetch('/api/spotify/playback/token', {cache:'no-store'});
    const json = await res.json();
    if (!res.ok || !json.access_token) throw new Error(json.error || '请先登录 Spotify');
    return json.access_token;
  };
  function loadSDK() {
    return new Promise((resolve, reject) => {
      if (window.Spotify && window.Spotify.Player) return resolve();
      window.onSpotifyWebPlaybackSDKReady = resolve;
      const script = document.createElement('script'); script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.onerror = () => reject(new Error('Spotify SDK 加载失败')); document.head.append(script);
      setTimeout(() => { if (!window.Spotify) reject(new Error('Spotify SDK 加载超时')); }, 15000);
    });
  }
  async function connect() {
    if (connected && deviceId) return deviceId;
    status('正在初始化 Spotify SDK…');
    await token(); await loadSDK();
    if (!player) {
      player = new window.Spotify.Player({name:'MineRadio Premium',getOAuthToken: cb => { token().then(cb).catch(e => status(e.message)); },volume:0.65});
      player.addListener('ready', ({device_id}) => { deviceId=device_id;connected=true;status('已连接。可以播放 Spotify 歌曲。'); });
      player.addListener('not_ready', () => {connected=false;deviceId='';status('Spotify 设备已离线');});
      for (const event of ['initialization_error','authentication_error','account_error','playback_error']) player.addListener(event, ({message}) => status(`${event}: ${message}`));
      player.addListener('autoplay_failed', () => status('自动播放被阻止，请点击播放按钮。'));
      player.addListener('player_state_changed', state => {
        if (!state) return; latest=state;
        const track=state.track_window && state.track_window.current_track;
        const holder=$('sp-current');holder.replaceChildren();
        if(track){const img=document.createElement('img');img.src=(track.album.images[0]||{}).url||'';img.alt='专辑封面';holder.append(img,document.createTextNode(`${track.name} — ${track.artists.map(a=>a.name).join(', ')}`));}
      });
    }
    const ok=await player.connect(); if(!ok) throw new Error('无法连接 Spotify 播放设备（可能不支持 DRM）');
    for(let i=0;i<40&&!deviceId;i++) await new Promise(r=>setTimeout(r,100));
    if(!deviceId) throw new Error('Spotify 未返回设备 ID，请检查 SDK/DRM');
    return deviceId;
  }
  function parseTrack(raw) {
    const value=raw.trim();
    const match=value.match(/^spotify:track:([A-Za-z0-9]{22})$/)||value.match(/^https?:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/);
    if(!match) throw new Error('请输入有效的 Spotify 单曲链接');
    return `spotify:track:${match[1]}`;
  }
  async function play() {
    const uri=parseTrack($('sp-uri').value);
    const id=await connect();
    if(player.activateElement) await player.activateElement();
    const access=await token();
    const response=await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(id)}`,{method:'PUT',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},body:JSON.stringify({uris:[uri]})});
    if(!response.ok) throw new Error(`Spotify 播放失败 (${response.status}): ${(await response.text()).slice(0,180)}`);
    status('已发送播放请求');
  }
  async function safe(fn){try{await fn();}catch(e){status(e.message||String(e));}}
  open.onclick=()=>{panel.hidden=!panel.hidden;};
  $('sp-close').onclick=()=>{panel.hidden=true;};
  // Login independently of MineRadio's original gated login modal.
  $('sp-login').onclick=()=>safe(async()=>{
    const clientId = $('sp-client-id').value.trim();
    if (!/^[a-fA-F0-9]{32}$/.test(clientId)) throw new Error('Client ID 应为 32 位十六进制字符串');
    if (!window.desktopWindow || typeof window.desktopWindow.openSpotifyMusicLogin !== 'function') {
      throw new Error('请通过 npm start 启动 Electron 桌面版，浏览器模式不支持本机 OAuth 登录');
    }
    status('正在保存 Spotify Client ID…');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res;
    try {
      res = await fetch('/api/spotify/config', {
        method:'POST', headers:{'Content-Type':'application/json'},
        cache:'no-store', signal:controller.signal,
        body:JSON.stringify({clientId,redirectUri:'http://127.0.0.1:43879/callback'})
      });
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('保存超时（10 秒）。请检查 MineRadio 后端是否启动，或是否运行了旧版本。');
      throw new Error('无法连接 MineRadio 的保存接口：' + (error.message || String(error)));
    } finally {
      clearTimeout(timeout);
    }
    let config;
    try { config = await res.json(); }
    catch (_) { throw new Error('保存接口返回了非 JSON 内容（HTTP ' + res.status + '），请检查后端版本。'); }
    if (!res.ok || config.ok === false) throw new Error(config.message || config.error || '保存 Client ID 失败（HTTP ' + res.status + '）');
    status('Client ID 已保存，正在打开 Spotify 官方登录页面…');
    const result = await window.desktopWindow.openSpotifyMusicLogin();
    if (!result || !result.ok) throw new Error(result?.message || result?.error || 'Spotify 授权未完成');
    const stRes = await fetch('/api/spotify/status',{cache:'no-store'});
    const st = await stRes.json();
    if (!st.loggedIn) throw new Error('授权已返回，但登录状态尚未确认，请重试');
    status('Spotify 登录成功！现在可以尝试连接播放器。');
  });
  $('sp-connect').onclick=()=>safe(connect);
  $('sp-play').onclick=()=>safe(play);
  $('sp-toggle').onclick=()=>safe(async()=>{await connect();await player.togglePlay();});
  $('sp-prev').onclick=()=>safe(async()=>{await connect();await player.previousTrack();});
  $('sp-next').onclick=()=>safe(async()=>{await connect();await player.nextTrack();});
})();
