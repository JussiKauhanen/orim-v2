/* orim · folder.js
 * Boards as .md files in a folder you choose (Chrome and Edge on a computer).
 * Each board is one Markdown file with a ```mermaid block, so it renders on GitHub, in Azure DevOps
 * and in VS Code; orim's own data rides along in its %% lines. Images go in "<name>.images/".
 * The browser keeps a copy of every board as before, so nothing is lost if the folder is unavailable.
 * Changes made to a file outside orim (Git, an editor, an AI assistant) are picked up while it is open.
 */
'use strict';
const Folder=(()=>{
  const supported=typeof window.showDirectoryPicker==='function'&&window.isSecureContext&&(()=>{ try{ return window.self===window.top; }catch(_){ return false; } })();
  let dir=null, perm='none';
  /* ---- the folder handle survives reloads in IndexedDB ---- */
  const idb=(mode,fn)=>new Promise((res,rej)=>{ let r; try{ r=indexedDB.open('orim-folder',1); }catch(e){ rej(e); return; }
    r.onupgradeneeded=()=>r.result.createObjectStore('h'); r.onerror=()=>rej(r.error);
    r.onsuccess=()=>{ try{ const tx=r.result.transaction('h',mode); const q=fn(tx.objectStore('h')); tx.oncomplete=()=>res(q&&q.result); tx.onerror=()=>rej(tx.error); }catch(e){ rej(e); } }; });
  const save=h=>idb('readwrite',s=>s.put(h,'dir')).catch(()=>{});
  const load=()=>idb('readonly',s=>s.get('dir')).catch(()=>null);
  const forget=()=>idb('readwrite',s=>s.delete('dir')).catch(()=>{});

  const ready=()=>!!dir&&perm==='granted';
  const name=()=>dir?dir.name:'';
  const state=()=>!supported?'unsupported':!dir?'none':perm==='granted'?'ready':'reconnect';

  async function init(){
    if(!supported) return;
    const h=await load(); if(!h) return;
    dir=h; try{ perm=await h.queryPermission({mode:'readwrite'}); }catch(_){ perm='prompt'; }
    if(perm==='granted') await scan();
    Boards.folderChanged();
  }
  async function choose(){
    if(!supported) return;
    let h; try{ h=await window.showDirectoryPicker({id:'orim-boards',mode:'readwrite',startIn:'documents'}); }catch(e){ if(e&&e.name!=='AbortError') toast('Could not open that folder'); return; }
    dir=h; perm='granted'; await save(h);
    const n=await scan(); Boards.folderChanged(true);
    toast('New boards are saved in '+h.name+(n?'. Found '+n+(n===1?' board':' boards')+' there':''));
  }
  async function reconnect(){
    if(!dir) return choose();
    try{ perm=await dir.requestPermission({mode:'readwrite'}); }catch(_){ perm='prompt'; }
    if(perm==='granted'){ await scan(); Boards.folderChanged(true); toast('Reconnected to '+dir.name); }
  }
  async function disconnect(){ dir=null; perm='none'; await forget(); Boards.folderChanged(); toast('Boards are saved in this browser only again'); }

  /* ---- reading and writing boards ---- */
  const MD_RE=/```mermaid[^\n]*\n([\s\S]*?)\n?```/;
  const codeOf=text=>{ const m=MD_RE.exec(text); return m?m[1].replace(/\s+$/,'')+'\n':null; };
  function fileText(old,title,code){
    const block='```mermaid\n'+code.replace(/\s+$/,'')+'\n```';
    if(old&&MD_RE.test(old)) return old.replace(MD_RE,()=>block);   // keep anything you wrote around the diagram
    return '# '+(title||'Untitled board')+'\n\n'+block+'\n';
  }
  // Keep the file's top heading in step with the board name.
  const retitle=(text,title)=>text&&/^# .*\n/.test(text)?text.replace(/^# .*\n/,()=>'# '+title+'\n'):text;
  const safe=t=>String(t||'Untitled board').replace(/[\\/:*?"<>|\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'Untitled board';
  async function exists(n){ try{ await dir.getFileHandle(n); return true; }catch(_){ return false; } }
  async function uniqueName(title,except){ const base=safe(title); let n=base+'.md', k=2; while(n!==except&&await exists(n)) n=base+' '+(k++)+'.md'; return n; }
  async function readFile(n){ const fh=await dir.getFileHandle(n); const f=await fh.getFile(); return {text:await f.text(),mod:f.lastModified}; }
  async function writeFile(n,text){ const fh=await dir.getFileHandle(n,{create:true}); const w=await fh.createWritable(); await w.write(text); await w.close(); return (await fh.getFile()).lastModified; }
  // All boards in the folder: every .md file with a mermaid flowchart in it.
  async function scan(){
    if(!ready()) return 0; const files=[];
    try{ for await (const [n,h] of dir.entries()){ if(h.kind!=='file'||!/\.md$/i.test(n)) continue;
      try{ const f=await h.getFile(); if(f.size>4e6) continue; const code=codeOf(await f.text()); if(code&&/(^|\n)\s*(flowchart|graph)\b/.test(code)) files.push({name:n,code,mod:f.lastModified}); }catch(_){} } }
    catch(_){ perm='prompt'; return 0; }
    return Boards.syncFolder(files);
  }
  /* ---- images: <name>.images/<id>.<ext> ---- */
  const imgDirName=n=>n.replace(/\.md$/i,'')+'.images';
  async function writeImages(n,imgs,known){
    const ids=Object.keys(imgs); if(!ids.length&&!known.size) return;
    const d=await dir.getDirectoryHandle(imgDirName(n),{create:true});
    for(const id of ids){ const url=imgs[id]; const sig=url.length+':'+url.slice(-24); if(known.get(id)===sig) continue;
      const m=/^data:([^;,]+)(;base64)?,(.*)$/s.exec(url); if(!m) continue;
      const ext=(m[1].split('/')[1]||'png').replace('svg+xml','svg').replace('jpeg','jpg');
      const bytes=m[2]?Uint8Array.from(atob(m[3]),c=>c.charCodeAt(0)):new TextEncoder().encode(decodeURIComponent(m[3]));
      for await (const [old] of d.entries()) if(old.startsWith(id+'.')&&old!==id+'.'+ext) try{ await d.removeEntry(old); }catch(_){}
      const fh=await d.getFileHandle(id+'.'+ext,{create:true}); const w=await fh.createWritable(); await w.write(new Blob([bytes],{type:m[1]})); await w.close(); known.set(id,sig); }
    for(const id of [...known.keys()]) if(!imgs[id]){ for await (const [old] of d.entries()) if(old.startsWith(id+'.')) try{ await d.removeEntry(old); }catch(_){} known.delete(id); }
  }
  async function readImages(n){
    const out={}; let d; try{ d=await dir.getDirectoryHandle(imgDirName(n)); }catch(_){ return out; }
    for await (const [f,h] of d.entries()){ if(h.kind!=='file') continue; const id=f.replace(/\.[^.]+$/,'');
      const file=await h.getFile(); out[id]=await new Promise(r=>{ const fr=new FileReader(); fr.onload=()=>r(fr.result); fr.onerror=()=>r(null); fr.readAsDataURL(file); }); }
    return out;
  }
  async function removeFile(n){ try{ await dir.removeEntry(n); }catch(_){} try{ await dir.removeEntry(imgDirName(n),{recursive:true}); }catch(_){} }

  // One write at a time per board; a newer request replaces a waiting one.
  const queue=new Map(), knownImgs=new Map();
  function write(meta,code,imgs){
    if(!ready()||!meta.file) return;
    const q=queue.get(meta.id)||{busy:false,next:null}; q.next={code,imgs}; queue.set(meta.id,q);
    if(!q.busy) pump(meta,q);
  }
  async function pump(meta,q){
    q.busy=true;
    while(q.next){ const job=q.next; q.next=null;
      try{
        let old=null, mod=0; try{ const r=await readFile(meta.file); old=r.text; mod=r.mod; }catch(_){}
        // Changed outside orim since we last saw it, and not by us: ask instead of overwriting.
        if(old!=null&&meta.fileMod&&mod>meta.fileMod+1&&codeOf(old)!==meta.fileCode&&codeOf(old)!==job.code){ Boards.fileConflict(meta.id,codeOf(old),mod); break; }
        // An untitled board gets a proper file name once it has a title.
        // A renamed board (or an untitled one that now has a title) moves to a matching file name.
        let n=meta.file; const want=meta.renameTo||(/^Untitled board( \d+)?\.md$/i.test(n)&&meta.title&&meta.title!=='Untitled board'?meta.title:null); delete meta.renameTo;
        if(want){ const nn=await uniqueName(want,n); if(nn!==n){ const txt=retitle(old,want); await writeFile(nn,fileText(txt,meta.title,job.code)); await removeFile(n); knownImgs.delete(meta.id); n=nn; meta.file=nn; old=txt; Boards.metaChanged(meta); } }
        meta.fileMod=await writeFile(n,fileText(old,meta.title,job.code)); meta.fileCode=job.code; meta.dirty=false;
        if(!knownImgs.has(meta.id)) knownImgs.set(meta.id,new Map());
        await writeImages(n,job.imgs||{},knownImgs.get(meta.id));
        Boards.metaChanged(meta,'saved');
      }catch(e){ console.error(e); meta.dirty=true; if(e&&e.name==='NotAllowedError'){ perm='prompt'; Boards.folderChanged(); } else Boards.metaChanged(meta,'error'); }
    }
    q.busy=false;
  }
  // While a folder board is open: has its file changed outside orim?
  async function check(meta){
    if(!ready()||!meta||!meta.file) return null;
    try{ const fh=await dir.getFileHandle(meta.file); const f=await fh.getFile(); if(f.lastModified<=meta.fileMod+1) return null;
      const code=codeOf(await f.text()); if(!code||code===meta.fileCode){ meta.fileMod=f.lastModified; return null; }
      return {code,mod:f.lastModified,images:await readImages(meta.file)}; }
    catch(e){ if(e&&e.name==='NotFoundError') return {missing:true}; return null; }
  }
  return {supported,init,choose,reconnect,disconnect,ready,name,state,scan,write,check,readFile,readImages,uniqueName,removeFile,fileText,codeOf};
})();
