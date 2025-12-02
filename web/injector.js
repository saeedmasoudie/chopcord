(async function() {
    'use strict';

    if (document.getElementById('cc-injected-flag')) return;
    const flag = document.createElement('div');
    flag.id = 'cc-injected-flag';
    document.documentElement.appendChild(flag);

    const activeDownloads = new Set();
    let isOffline = false;
    let MEDIA_PORT = 0;
    let CUSTOM_LOGO = "";

    async function apiCall(name, ...args) {
        try {
            if (window.pywebview?.api?.[name]) {
                return await window.pywebview.api[name](...args);
            }
        } catch (e) { console.error("API Error:", name, e); }
        return null;
    }

    async function waitForBridge() {
        let attempts = 0;
        while (!window.pywebview || !window.pywebview.api) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
            if (attempts > 200) break;
        }
        return Boolean(window.pywebview && window.pywebview.api);
    }

    waitForBridge().then(async () => {
        CUSTOM_LOGO = await apiCall('get_logo');
        if(CUSTOM_LOGO) {
            const img = document.querySelector('#cc-seamless-loader img');
            const ph = document.querySelector('#cc-seamless-loader .logo-placeholder');
            if(img && ph) { img.src = CUSTOM_LOGO; img.style.display='block'; ph.style.display='none'; }
        }
    });

    const seamlessHTML = `
    <div id="cc-seamless-loader" style="
        position: fixed; inset: 0; background-color: #09090b; z-index: 2147483647;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-family: 'Segoe UI', system-ui, sans-serif; transition: opacity 0.6s ease-out;
    ">
        <style>
          @keyframes cc-slide { 0% { left: -50%; } 100% { left: 100%; } }
          .cc-logo-wrap {
            width: 100px; height: 100px; background: rgba(255,255,255,0.05);
            border-radius: 20px; display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 30px rgba(88, 101, 242, 0.2); margin-bottom: 25px; overflow: hidden;
          }
          .cc-logo-wrap img { width: 100%; height: 100%; object-fit: cover; display:none; }
          .logo-placeholder { font-size: 30px; font-weight: bold; color: #555; }
        </style>
        <div class="cc-logo-wrap">
            <img src="" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
            <div class="logo-placeholder">APP</div>
        </div>
        <h1 style="font-size: 24px; font-weight: 800; letter-spacing: 4px; margin: 0; background: linear-gradient(90deg, #fff, #a1a1aa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-transform: uppercase;">ChopCord</h1>
        <p style="font-size: 12px; color: #71717a; margin-top: 8px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;">Establishing Secure Connection...</p>
        <div style="width: 200px; height: 4px; background: #27272a; border-radius: 2px; margin-top: 30px; overflow: hidden; position: relative;">
            <div style="position: absolute; top: 0; left: 0; bottom: 0; width: 50%; background: #5865F2; box-shadow: 0 0 10px #5865F2; animation: cc-slide 2s infinite ease-in-out;"></div>
        </div>
    </div>
    `;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = seamlessHTML;
    document.documentElement.appendChild(tempDiv.firstElementChild);

    function hideLoader() {
        if(document.querySelector('div[class*="appMount-"]')) {
            const l = document.getElementById('cc-seamless-loader');
            if(l) { l.style.opacity = '0'; setTimeout(() => l.remove(), 600); }
        } else { requestAnimationFrame(hideLoader); }
    }
    setTimeout(() => { const l=document.getElementById('cc-seamless-loader'); if(l) l.remove(); }, 12000);
    hideLoader();

    const style = document.createElement('style');
    style.textContent = `
        [aria-label="Download Apps"], [class*="giftButton"],
        div[class*="ready-"], nav [href*="nitro"], [class*="wordmark-"] { display: none !important; }

        :root { --cc-bg-glass: rgba(18, 18, 22, 0.95); --cc-border: rgba(255, 255, 255, 0.08); --cc-accent: #5865F2; --cc-danger: #da373c; }

        #cc-offline-overlay {
            position: fixed; top: 10px; left: 50%; transform: translateX(-50%) translateY(-150%);
            background: rgba(0, 0, 0, 0.85); border: 1px solid #da373c;
            color: #fff; padding: 6px 16px; border-radius: 20px;
            backdrop-filter: blur(12px); 
            z-index: 2147483647 !important;
            display: flex !important; 
            align-items: center; gap: 10px;
            transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
            pointer-events: none;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5); font-size: 13px; font-weight: 600;
        }
        #cc-offline-overlay.active { transform: translateX(-50%) translateY(0); }
        .cc-offline-dot { width: 8px; height: 8px; background: #da373c; border-radius: 50%; animation: pulse-red 2s infinite; }
        @keyframes pulse-red { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

        #cc-fab {
            position: fixed; bottom: 20px; right: 20px; width: 45px; height: 45px;
            background: #2b2d31; border: 1px solid var(--cc-border); border-radius: 50%; z-index: 9990;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5); cursor: pointer; transition: transform 0.2s, background 0.2s; color: #ccc;
        }
        #cc-fab:hover { transform: scale(1.1); background: var(--cc-accent); color: white; }
        #cc-fab svg { width: 24px; height: 24px; fill: currentColor; }
        #cc-fab.cc-has-update::after {
            content: ''; position: absolute; top: 0px; right: 0px; width: 14px; height: 14px; background: #FFA500; border: 2px solid #313338; border-radius: 50%; box-shadow: 0 0 5px #FFA500;
        }

        .cc-replaced-btn { display: inline-flex; align-items: center; justify-content: center; color: #5865F2; cursor: pointer; transition: transform 0.2s; width: 24px; height: 24px; }
        .cc-replaced-btn:hover { transform: scale(1.15); color: #fff; }
        .cc-dl-overlay { position: absolute; bottom: 10px; left: 10px; right: 10px; height: 8px; background: rgba(0,0,0,0.6); z-index: 100; overflow: hidden; border-radius: 6px; pointer-events: none; border: 1px solid rgba(255,255,255,0.1); }
        .cc-dl-bar { height: 100%; background: #23a559; width: 0%; transition: width 0.2s linear; box-shadow: 0 0 10px #23a559; border-radius: 4px; }
        .cc-dl-text { position: absolute; bottom: 22px; right: 10px; background: rgba(0,0,0,0.8); color: white; font-size: 11px; padding: 3px 8px; border-radius: 4px; font-weight: bold; pointer-events: none; z-index: 101; }
        
        .cc-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 100000; display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
        .cc-modal-backdrop.active { opacity: 1; pointer-events: auto; }
        .cc-modal { background: #313338; width: 400px; max-width: 90vw; border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); transform: scale(0.9); transition: transform 0.2s; overflow: hidden; display: flex; flex-direction: column; border: 1px solid var(--cc-border); }
        .cc-modal-backdrop.active .cc-modal { transform: scale(1); }
        .cc-modal-header { padding: 20px; color: white; font-size: 18px; font-weight: 700; background: #2b2d31; }
        .cc-modal-body { padding: 20px; color: #b5bac1; font-size: 14px; line-height: 1.5; background: #313338; }
        .cc-modal-footer { background: #2b2d31; padding: 15px 20px; display: flex; justify-content: flex-end; gap: 10px; }
        .cc-btn { padding: 8px 16px; border-radius: 4px; border:none; color:white; font-weight:600; cursor:pointer; font-size:13px; transition: background 0.2s; }
        .cc-btn-primary { background: var(--cc-accent); }
        .cc-btn-primary:hover { background: #4752c4; }
        .cc-btn-danger { background: var(--cc-danger); }
        .cc-btn-secondary { background: transparent; color: white; }
        .cc-btn-secondary:hover { text-decoration: underline; }
        .cc-input { width: 100%; padding: 10px; background: #1e1f22; border: none; color: white; border-radius: 4px; box-sizing:border-box; outline: none; }
        .cc-label { font-size: 11px; text-transform: uppercase; color: #b5bac1; font-weight: 700; margin: 15px 0 8px; display:block; }
        .cc-dl-item { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; background: rgba(255,255,255,0.05); padding: 12px; margin-bottom: 8px; border-radius: 4px; }
        .cc-dl-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; color: #f2f3f5; }
        .cc-dl-meta { color: #aaa; font-size: 12px; }
    `;
    document.documentElement.appendChild(style);

    function ensureOverlay() {
        if (!document.getElementById('cc-offline-overlay')) {
            const offlineOverlay = document.createElement('div');
            offlineOverlay.id = 'cc-offline-overlay';
            offlineOverlay.innerHTML = `<div class="cc-offline-dot"></div><span>Offline Mode - Cached View</span>`;
            if (isOffline) offlineOverlay.classList.add('active');
            document.documentElement.appendChild(offlineOverlay);
        }
    }
    ensureOverlay();
    setInterval(ensureOverlay, 2000);

    function showCustomModal(title, body, type = 'confirm', placeholder='', buttons = null) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'cc-modal-backdrop';

            let inputHtml = type === 'prompt' ? `<input type="text" class="cc-input" style="margin-top:15px" placeholder="${placeholder}" id="cc-modal-input">` : '';

            let footerHtml = '';
            if (buttons) {
                buttons.forEach(btn => { footerHtml += `<button class="cc-btn ${btn.class}" data-val="${btn.value}">${btn.text}</button>`; });
            } else {
                if (type === 'update') footerHtml = `<button class="cc-btn cc-btn-secondary" data-val="false">Later</button><button class="cc-btn cc-btn-primary" style="background:#23a559" data-val="true">Update Now</button>`;
                else if (type === 'alert') footerHtml = `<button class="cc-btn cc-btn-primary" data-val="true">OK</button>`;
                else footerHtml = `<button class="cc-btn cc-btn-secondary" data-val="false">Cancel</button><button class="cc-btn cc-btn-primary" data-val="true">Confirm</button>`;
            }

            backdrop.innerHTML = `<div class="cc-modal"><div class="cc-modal-header">${title}</div><div class="cc-modal-body">${body}${inputHtml}</div><div class="cc-modal-footer">${footerHtml}</div></div>`;
            document.body.appendChild(backdrop);

            requestAnimationFrame(() => backdrop.classList.add('active'));
            if(type === 'prompt') document.getElementById('cc-modal-input').focus();

            const close = (val) => { backdrop.classList.remove('active'); setTimeout(() => backdrop.remove(), 200); resolve(val); };

            backdrop.querySelectorAll('.cc-modal-footer button').forEach(b => {
                b.onclick = () => {
                    if(type==='prompt' && b.dataset.val === 'true') close(document.getElementById('cc-modal-input').value);
                    else if (b.dataset.val === 'true') close(true);
                    else if (b.dataset.val === 'false') close(false);
                    else close(b.dataset.val);
                }
            });
            if(type === 'prompt') { document.getElementById('cc-modal-input').onkeydown = (e) => { if(e.key === 'Enter') backdrop.querySelector('button[data-val="true"]').click(); }; }
        });
    }

    function processNode(node) {
        return;
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => { if (node.nodeType === 1) processNode(node); });
        });
    });

    function showToast(msg, target) {
        const t = document.createElement('div');
        t.innerText = msg;
        t.style.cssText = "position:absolute;background:#111;color:white;padding:5px 10px;border-radius:4px;font-size:12px;z-index:999;pointer-events:none;";
        const rect = target.getBoundingClientRect();
        t.style.top = (rect.top - 30) + "px"; t.style.left = rect.left + "px";
        document.body.appendChild(t); setTimeout(() => t.remove(), 2000);
    }

    window.addEventListener('click', async (e) => {
        if(e.target.closest('#cc-drawer') || e.target.closest('.cc-replaced-btn')) return;
        const link = e.target.closest('a[href]');
        if(!link || !(link.href.includes('cdn.discordapp') || link.href.includes('media.discordapp'))) return;
        if(e.ctrlKey || e.shiftKey || e.altKey || link.href.includes('/avatars/') || link.href.includes('/icons/')) return;

        e.preventDefault(); e.stopPropagation();
        const url = link.href;
        if (activeDownloads.has(url)) return;

        const existsFilename = await apiCall('check_file_exists', url);
        if (existsFilename) {
            const choice = await showCustomModal("File Exists", `<b>${existsFilename}</b> is already downloaded.`, "custom", "", [
                {text: "Cancel", class: "cc-btn-secondary", value: "cancel"},
                {text: "Open Folder", class: "cc-btn-primary", value: "folder"},
                {text: "Open File", class: "cc-btn-primary", value: "file"}
            ]);
            if (choice === 'file') apiCall('open_downloaded_file', existsFilename);
            if (choice === 'folder') apiCall('show_in_folder', existsFilename);
            return;
        }

        activeDownloads.add(url);
        const container = link.closest('[class*="wrapper"]') || link.parentElement;
        if(container && window.getComputedStyle(container).position === 'static') container.style.position = 'relative';

        const overlay = document.createElement('div');
        overlay.className = 'cc-dl-overlay'; overlay.innerHTML = `<div class="cc-dl-bar"></div>`;
        const percentText = document.createElement('div');
        percentText.className = 'cc-dl-text'; percentText.innerText = "0%";
        if(container) { container.appendChild(overlay); container.appendChild(percentText); }

        const res = await apiCall('start_download', url);
        if(res === 'error') {
            activeDownloads.delete(url); showToast("Download Failed", link); overlay.remove(); percentText.remove(); return;
        }

        const interval = setInterval(async () => {
            const status = await apiCall('get_download_status', url);
            if (!status) return;
            const bar = overlay.querySelector('.cc-dl-bar');
            if(bar) bar.style.width = status.progress + '%';
            percentText.innerText = status.progress + '%';
            if (status.status === 'done' || status.status === 'exists') {
                clearInterval(interval); activeDownloads.delete(url);
                percentText.innerText = "Saved"; percentText.style.background = "#23a559";
                processNode(container);
                setTimeout(() => { overlay.remove(); percentText.remove(); }, 1500);
            } else if (status.status === 'error') {
                clearInterval(interval); activeDownloads.delete(url);
                percentText.innerText = "Error"; percentText.style.background = "#da373c";
            }
        }, 500);
    }, true);

    function createDrawer() {
        if (document.getElementById('cc-drawer-root')) return;
        const root = document.createElement('div');
        root.id = 'cc-drawer-root';
        root.innerHTML = `
            <div id="cc-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);z-index:9990;opacity:0;transition:opacity 0.3s;pointer-events:none"></div>
            <div id="cc-drawer" style="position:fixed; left:0; top:0; bottom:0; width:650px; max-width:85vw; background:var(--cc-bg-glass); backdrop-filter:blur(20px); border-right:1px solid var(--cc-border); z-index:9991; display:flex; transform:translateX(-105%); transition:transform 0.3s cubic-bezier(0,0,0,1);">
                <div style="width:200px; border-right:1px solid var(--cc-border); padding:20px; display:flex; flex-direction:column; gap:5px">
                    <h2 style="color:white;margin:0 0 20px 10px;font-size:18px">ChopCord</h2>
                    <div class="cc-tab-btn active" data-tab="tools" style="padding:10px;cursor:pointer;color:#aaa;border-radius:5px">Tools</div>
                    <div class="cc-tab-btn" data-tab="network" style="padding:10px;cursor:pointer;color:#aaa;border-radius:5px">Network</div>
                    <div class="cc-tab-btn" data-tab="profiles" style="padding:10px;cursor:pointer;color:#aaa;border-radius:5px">Profiles</div>
                    <div class="cc-tab-btn" data-tab="downloads" style="padding:10px;cursor:pointer;color:#aaa;border-radius:5px">Downloads</div>
                    <div class="cc-tab-btn" data-tab="cache" style="padding:10px;cursor:pointer;color:#aaa;border-radius:5px">Storage</div>
                    <div class="cc-tab-btn" data-tab="about" style="padding:10px;cursor:pointer;color:#aaa;border-radius:5px">About</div>
                    <div style="flex:1"></div><div id="cc-close" style="padding:10px;cursor:pointer;color:#da373c">Close</div>
                </div>
                <div id="cc-content" style="flex:1; padding:30px; overflow-y:auto; color:#eee"></div>
            </div>`;
        document.body.appendChild(root);
        const close = () => { document.getElementById('cc-drawer').style.transform = 'translateX(-105%)'; document.getElementById('cc-backdrop').style.opacity = '0'; document.getElementById('cc-backdrop').style.pointerEvents = 'none'; };
        document.getElementById('cc-close').onclick = close; document.getElementById('cc-backdrop').onclick = close;
        document.querySelectorAll('.cc-tab-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.cc-tab-btn').forEach(b => {b.style.background='transparent'; b.style.color='#aaa'; b.classList.remove('active');});
                btn.style.background = 'rgba(255,255,255,0.05)'; btn.style.color='white'; btn.classList.add('active');
                renderTab(btn.dataset.tab, document.getElementById('cc-content'));
            };
        });
        renderTab('tools', document.getElementById('cc-content'));
    }

    async function renderTab(tab, container) {
        container.innerHTML = `<h2 style="text-transform:capitalize;margin-bottom:20px">${tab}</h2>`;
        if (tab === 'tools') {
            container.innerHTML += `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div style="background:rgba(255,255,255,0.05); padding:20px; border-radius:10px; text-align:center; opacity:0.5; border:1px dashed #555;">
                        <div style="font-size:30px; margin-bottom:10px;">🔊</div><h3 style="margin:0">Soundboard</h3><p style="font-size:12px; color:#aaa;">Coming Soon</p>
                    </div>
                </div>`;
        }
        else if (tab === 'network') {
            const cfg = await apiCall('get_config') || {};
            let proxyUrl = cfg.proxy || "";
            let proto = "http", host = "", port = "", user = "", pass = "";
            if(proxyUrl) {
                try {
                    let temp = proxyUrl;
                    if(temp.includes('://')) { const s = temp.split('://'); proto = s[0]; temp = s[1]; }
                    if(temp.includes('@')) { const s = temp.split('@'); const c = s[0].split(':'); user = c[0]; pass = c[1]||""; temp = s[1]; }
                    const s = temp.split(':'); host = s[0]; port = s[1]||"";
                } catch(e) {}
            }
            container.innerHTML += `
                <div style="background:rgba(0,0,0,0.2);padding:15px;border-radius:8px">
                    <span class="cc-label">Proxy Configuration</span>
                    <select id="px-proto" class="cc-input" style="background:#2b2d31;margin-bottom:10px">
                        <option value="http" ${proto==='http'?'selected':''}>HTTP</option>
                        <option value="https" ${proto==='https'?'selected':''}>HTTPS</option>
                        <option value="socks4" ${proto==='socks4'?'selected':''}>SOCKS4</option>
                        <option value="socks5" ${proto==='socks5'?'selected':''}>SOCKS5</option>
                    </select>
                    <div style="display:flex;gap:10px;margin-bottom:10px">
                        <input id="px-host" class="cc-input" placeholder="Host IP" value="${host}" style="flex:2">
                        <input id="px-port" class="cc-input" placeholder="Port" value="${port}" style="flex:1">
                    </div>
                    <div style="display:flex;gap:10px">
                        <input id="px-user" class="cc-input" placeholder="User (Optional)" value="${user}">
                        <input id="px-pass" class="cc-input" type="password" placeholder="Pass (Optional)" value="${pass}">
                    </div>
                    <button id="btn-test-proxy" class="cc-btn" style="background:#4e5058;width:100%;margin-top:10px">Test Proxy Connection</button>
                </div>
                <span class="cc-label">Custom DNS (DoH)</span>
                <input id="inp-dns" class="cc-input" placeholder="1.1.1.1 or 8.8.8.8" value="${cfg.dns||''}">
                <button id="btn-save-net" class="cc-btn cc-btn-primary" style="margin-top:20px;width:100%">Save & Restart App</button>
            `;
            setTimeout(() => {
                 document.getElementById('btn-test-proxy').onclick = async () => {
                    const h = document.getElementById('px-host').value;
                    const p = document.getElementById('px-port').value;
                    const u = document.getElementById('px-user').value;
                    const pw = document.getElementById('px-pass').value;
                    if(!h || !p) return showCustomModal("Proxy Error", "Please enter Host and Port", "alert");

                    let url = `${document.getElementById('px-proto').value}://`;
                    if(u) { url += `${u}`; if(pw) url += `:${pw}`; url += `@`; }
                    url += `${h}:${p}`;

                    const ok = await apiCall('check_proxy_connection', url);
                    showCustomModal(ok?"Success":"Failed", ok?"✅ Connection established!":"❌ Connection failed.\nCheck IP, Port, or Credentials.", "alert");
                };
                document.getElementById('btn-save-net').onclick = async () => {
                     const h = document.getElementById('px-host').value;
                     const p = document.getElementById('px-port').value;
                     const u = document.getElementById('px-user').value;
                     const pw = document.getElementById('px-pass').value;
                     let url = "";
                     if(h && p) {
                         url = `${document.getElementById('px-proto').value}://`;
                         if(u) { url += `${u}`; if(pw) url += `:${pw}`; url += `@`; }
                         url += `${h}:${p}`;
                     }
                     await apiCall('save_config', { proxy: url, dns: document.getElementById('inp-dns').value });
                     apiCall('restart_application');
                };
            }, 100);
        }
        else if (tab === 'downloads') {
            const list = await apiCall('get_downloads_list') || [];
            if(list.length === 0) container.innerHTML += `<div style="text-align:center;color:#aaa;padding:40px">No downloads found</div>`;
            else {
                const listContainer = document.createElement('div');
                list.forEach(f => {
                    const d = document.createElement('div');
                    d.className = 'cc-dl-item';
                    d.innerHTML = `
                        <div style="min-width:0"><div class="cc-dl-name" title="${f.name}">${f.name}</div><div class="cc-dl-meta">${f.size} MB</div></div>
                        <button class="cc-btn cc-btn-primary btn-open">Open</button>
                        <button class="cc-btn cc-btn-danger btn-del">Delete</button>`;
                    d.querySelector('.btn-open').onclick = () => apiCall('open_downloaded_file', f.name);
                    d.querySelector('.btn-del').onclick = async () => { if (await showCustomModal("Delete File", `Delete <b>${f.name}</b>?`)) { await apiCall('delete_download', f.name); renderTab('downloads', container); } };
                    listContainer.appendChild(d);
                });
                container.appendChild(listContainer);
            }
            const openFolderBtn = document.createElement('button');
            openFolderBtn.className = 'cc-btn cc-btn-secondary';
            openFolderBtn.style.cssText = "width:100%; margin-top:15px; border: 1px solid rgba(255,255,255,0.1);";
            openFolderBtn.innerText = "📂 Open Downloads Folder";
            openFolderBtn.onclick = () => apiCall('open_downloads_folder');
            container.appendChild(openFolderBtn);
        }
        else if (tab === 'cache') {
            const stats = await apiCall('get_cache_stats') || {count:0, size_mb:0};
            container.innerHTML += `
                <div style="background:rgba(255,255,255,0.05);padding:20px;border-radius:8px;text-align:center;margin-bottom:20px">
                    <div style="font-size:32px;font-weight:bold;color:white">${stats.size_mb} MB</div><div style="color:#aaa">Total Secure Cache</div>
                </div>
                <button id="btn-clear-cache" class="cc-btn cc-btn-danger" style="width:100%">Clear Cache</button>`;
            setTimeout(() => {
                document.getElementById('btn-clear-cache').onclick = async () => { if(await showCustomModal("Clear Cache", "Delete all cached files?")) { await apiCall('save_config', { '__clear_cache': true }); renderTab('cache', container); } }
            }, 0);
        }
        else if (tab === 'profiles') {
            const profiles = await apiCall('get_profiles_with_meta') || [];
            const cur = await apiCall('get_current_profile');
            profiles.forEach(p => {
                const row = document.createElement('div');
                row.style.cssText = "display:flex;justify-content:space-between;padding:15px;margin-bottom:10px;background:rgba(255,255,255,0.05);border-radius:5px";
                row.innerHTML = `<span>${p.name} ${p.name===cur?'(Active)':''}</span>`;
                if(p.name !== cur) { const sw = document.createElement('button'); sw.className='cc-btn cc-btn-primary'; sw.textContent='Switch'; sw.onclick = () => apiCall('switch_profile', p.name); row.appendChild(sw); }
                container.appendChild(row);
            });
            const btn = document.createElement('button'); btn.className='cc-btn cc-btn-secondary'; btn.textContent='+ New Profile'; btn.style.width='100%';
            btn.onclick = async () => { const n = await showCustomModal("New Profile", "Profile Name:", "prompt", "Alt Account"); if(n) apiCall('create_profile', n).then(() => renderTab('profiles', container)); };
            container.appendChild(btn);
        }
        else if (tab === 'about') {
            const status = await apiCall('get_update_status');
            const ver = status ? status.version : "Unknown";
            container.innerHTML = `<div style="text-align:center; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 8px;"><h3 style="margin:0; font-size: 20px;">ChopCord</h3><p style="color: #aaa; margin: 5px 0 20px;">Version ${ver}</p><button id="btn-manual-update" class="cc-btn cc-btn-primary" style="width: 100%; margin-bottom: 10px;">Check for Updates</button><button id="btn-source" class="cc-btn cc-btn-secondary" style="width: 100%; margin-bottom: 5px;">View Source Code</button></div>`;
            setTimeout(() => {
                document.getElementById('btn-manual-update').onclick = async () => { const update = await apiCall('get_update_status'); if (update && update.available) { if(await showCustomModal("Update Found", `New version ${update.version} is available!`, "update")) { apiCall('open_external_url', update.url); } } else { showCustomModal("Up to Date", "You are running the latest version.", "alert"); } };
                document.getElementById('btn-source').onclick = () => apiCall('open_external_url', 'https://github.com/saeedmasoudie/chopcord');
            }, 0);
        }
    }
    function toggleDrawer() {
        createDrawer();
        const d = document.getElementById('cc-drawer'), b = document.getElementById('cc-backdrop');
        if (d.style.transform === 'translateX(0px)') {
            d.style.transform = 'translateX(-105%)'; b.style.opacity = '0'; b.style.pointerEvents = 'none';
        } else {
            d.style.transform = 'translateX(0px)'; b.style.opacity = '1'; b.style.pointerEvents = 'auto';
            const activeTab = document.querySelector('.cc-tab-btn.active')?.dataset.tab || 'tools';
            renderTab(activeTab, document.getElementById('cc-content'));
        }
    }

    async function initSafeBoot() {
        const ok = await waitForBridge();
        if(!ok) console.warn('bridge unavailable');
        const cfg = await apiCall('get_config');
        MEDIA_PORT = await apiCall('get_media_port');
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(async () => { const update = await apiCall('get_update_status'); if (update && update.available) { document.getElementById('cc-fab')?.classList.add('cc-has-update'); if (await showCustomModal("Update Available", `New version (${update.version}) available!`, "update")) apiCall('open_external_url', update.url); } }, 3000);
    }
    if(window.pywebview) initSafeBoot(); else window.addEventListener('pywebviewready', initSafeBoot);

    if (!document.getElementById('cc-fab')) {
        const fab = document.createElement('div'); fab.id = 'cc-fab';
        fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`;
        fab.onclick = toggleDrawer; document.body.appendChild(fab);
    }
    window.setDiscordStatus = function(status) {
        const el = document.getElementById('cc-offline-overlay');
        if(!el) return;
        if(status) {
            el.classList.remove('active');
            isOffline=false;
        } else {
            isOffline=true;
            el.classList.add('active');
        }
    };
})();