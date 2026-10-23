/* orim · title.js
 * Diagram title kept in Mermaid front matter.
 */
'use strict';
function syncTitle(){ const t=state.model?state.model.title:''; const inp=$('#docTitle'); if(document.activeElement!==inp) inp.value=t||''; }
function setTitleInCode(code,title){
  const lines=code.split('\n'); let i=0; while(i<lines.length&&!lines[i].trim()) i++;
  const clean=title.replace(/\n/g,' ').trim();
  if(lines[i]&&lines[i].trim()==='---'){
    let j=i+1; while(j<lines.length&&lines[j].trim()!=='---') j++;
    if(j<lines.length){
      let found=-1; for(let k=i+1;k<j;k++) if(/^\s*title\s*:/.test(lines[k])) found=k;
      if(found>=0){ if(clean) lines[found]='title: '+clean; else { lines.splice(found,1); j--; } }
      else if(clean){ lines.splice(i+1,0,'title: '+clean); j++; }
      if(j===i+1) lines.splice(i,2);
      return lines.join('\n');
    }
  }
  return clean?'---\ntitle: '+clean+'\n---\n'+code.replace(/^\s*\n/,''):code;
}
let titleT=0;
$('#docTitle').addEventListener('input',e=>{
  state.code=setTitleInCode(state.code,e.target.value); reparse(); setEditorFromCode(); saveLocal();
  clearTimeout(titleT); titleT=setTimeout(()=>histPush(state.code),600);
});
$('#docTitle').addEventListener('keydown',e=>{ if(e.key==='Enter') e.target.blur(); });
