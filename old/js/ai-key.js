/* orim · ai-key.js
 * Claude with your own Anthropic API key, for copies of orim outside Claude (GitHub Pages, a local file).
 * The key is kept in this browser only and sent only to api.anthropic.com. Answers stream in the same
 * way as inside Claude, so the AI tab works the same: sample(input, {onText, signal, modelTier}).
 */
'use strict';
const AIKey=(()=>{
  const LSK='orim.anthropicKey', LSM='orim.anthropicModel', LSW='orim.anthropicWorkspace', API='https://api.anthropic.com/v1/messages';
  const KEYS_URL='https://platform.claude.com/settings/keys?utm_source=claude_ai&utm_medium=web&utm_campaign=user_menu&utm_content=api_console', WS_URL='https://platform.claude.com/settings/workspaces';
  const MODELS=[['claude-sonnet-5-5','Sonnet 5.5','recommended'],['claude-haiku-5-5','Haiku 5.5','fastest, lowest cost'],['claude-opus-5-5','Opus 5.5','most capable']];
  const store=()=>{ try{ return localStorage; }catch(_){ return null; } }, sess=()=>{ try{ return sessionStorage; }catch(_){ return null; } };
  function get(){ try{ return (store()&&store().getItem(LSK))||(sess()&&sess().getItem(LSK))||''; }catch(_){ return ''; } }
  function set(key,remember){ clear(); try{ (remember?store():sess()).setItem(LSK,key); }catch(_){ mem=key; } mem=key; }
  let mem='';
  function key(){ return get()||mem; }
  function clear(){ mem=''; for(const s of [store(),sess()]) try{ if(s){ s.removeItem(LSK); s.removeItem(LSW); } }catch(_){} }
  // Keys that work across workspaces (or are linked to your account) need the workspace to use on each request.
  function workspace(){ try{ return (store()&&store().getItem(LSW))||(sess()&&sess().getItem(LSW))||''; }catch(_){ return ''; } }
  function setWorkspace(id,remember){ for(const s of [store(),sess()]) try{ s&&s.removeItem(LSW); }catch(_){} if(id) try{ (remember?store():sess()).setItem(LSW,id); }catch(_){} }
  const looksWorkspace=w=>/^wrkspc_[A-Za-z0-9]{6,}$/.test(String(w||'').trim());
  function model(){ try{ const m=store()&&store().getItem(LSM); if(MODELS.some(x=>x[0]===m)) return m; }catch(_){} return MODELS[0][0]; }
  function setModel(m){ try{ store()&&store().setItem(LSM,m); }catch(_){} }
  const looksValid=k=>/^sk-ant-[\w-]{20,}$/.test(String(k||'').trim());
  const b64=blob=>new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(String(fr.result).split(',')[1]||''); fr.onerror=()=>rej(fr.error); fr.readAsDataURL(blob); });
  const fail=(code,message)=>Object.assign(new Error(message||code),{code});
  // Stream a Messages API answer, handing each piece of text to onText as it arrives.
  async function sample(input,opt){
    opt=opt||{}; const k=key(); if(!k) throw fail('no_key','Add an API key first');
    let messages=typeof input==='string'?[{role:'user',content:input}]:input;
    // Pictures go with the last user turn, before its text, as the Messages API expects.
    const pics=opt.images?[].concat(opt.images):[];
    if(pics.length){ const blocks=[]; for(const b of pics) blocks.push({type:'image',source:{type:'base64',media_type:b.type||'image/jpeg',data:await b64(b)}});
      const last=messages[messages.length-1]; messages=messages.slice(0,-1).concat([{role:'user',content:blocks.concat([{type:'text',text:String(last.content)}])}]); }
    const m=opt.modelTier==='default'?'claude-opus-5-5':model();
    const headers={'content-type':'application/json','x-api-key':k,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}; const ws=workspace(); if(ws) headers['anthropic-workspace-id']=ws;
    let res;
    try{
      res=await fetch(API,{method:'POST',signal:opt.signal,headers,
        body:JSON.stringify({model:m,max_tokens:16000,stream:true,messages})});
    }catch(e){ if(e&&e.name==='AbortError') throw fail('cancelled'); throw fail('network','Could not reach the Claude API'); }
    if(!res.ok){ let j=null; try{ j=await res.json(); }catch(_){} const t=j&&j.error&&j.error.type, msg=j&&j.error&&j.error.message;
      if(/workspace/i.test(msg||'')&&/anthropic-workspace-id|not scoped|workspace id/i.test(msg||'')) throw fail('needs_workspace',msg);
      throw fail(res.status===401||res.status===403?'bad_key':res.status===429?'rate_limited':res.status===529||t==='overloaded_error'?'overloaded':res.status===413||/too long|too large/i.test(msg||'')?'prompt_too_large':'api_error',msg); }
    const reader=res.body.getReader(), dec=new TextDecoder(); let buf='', text='', stop=null, usage={}, ansModel=m;
    try{
      for(;;){ const {value,done}=await reader.read(); if(done) break; buf+=dec.decode(value,{stream:true});
        let i; while((i=buf.indexOf('\n\n'))>=0){ const ev=buf.slice(0,i); buf=buf.slice(i+2);
          const data=ev.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join(''); if(!data) continue;
          let o; try{ o=JSON.parse(data); }catch(_){ continue; }
          if(o.type==='content_block_delta'&&o.delta&&o.delta.type==='text_delta'){ text+=o.delta.text; if(opt.onText) opt.onText({delta:o.delta.text,text}); }
          // The stream reports the model and the tokens used as it goes, so the cost needs no extra call.
          else if(o.type==='message_start'&&o.message){ ansModel=o.message.model||ansModel; Object.assign(usage,o.message.usage||{}); }
          else if(o.type==='message_delta'){ if(o.delta) stop=o.delta.stop_reason||stop; if(o.usage) Object.assign(usage,o.usage); }
          else if(o.type==='error') throw fail(o.error&&o.error.type==='overloaded_error'?'overloaded':'api_error',o.error&&o.error.message); } }
    }catch(e){ if(e&&e.name==='AbortError') throw fail('cancelled'); throw e.code?e:fail('network','The answer was cut off'); }
    return {text,truncated:stop==='max_tokens',model:ansModel,usage};
  }
  // List prices in USD per million tokens (input, output, cache write 5 min, cache read), from the Claude pricing page.
  const PRICES={'claude-sonnet-5-5':[2,10,2.5,0.1],'claude-opus-5-5':[4,20,5,0.2],'claude-haiku-5-5':[0.1,0.5,0.125,0.01]};
  const PRICES_LONG={'claude-haiku-5-5':[0.5,2.5,0.625,0.05]};
  function cost(model,u){ const k=Object.keys(PRICES).find(x=>String(model||'').startsWith(x)); if(!k||!u) return null;
    const inp=(u.input_tokens||0), cw=(u.cache_creation_input_tokens||0), cr=(u.cache_read_input_tokens||0), out=(u.output_tokens||0);
    const P=(PRICES_LONG[k]&&inp+cw+cr>100000)?PRICES_LONG[k]:PRICES[k];
    return (inp*P[0]+out*P[1]+cw*P[2]+cr*P[3])/1e6; }
  const nameOf=id=>{ const x=MODELS.find(q=>String(id||'').startsWith(q[0])); return x?x[1]:String(id||''); };
  function modelName(){ const x=MODELS.find(q=>q[0]===model()); return x?x[1]:model(); }
  return {get:key,set,clear,model,setModel,modelName,cost,nameOf,workspace,setWorkspace,looksWorkspace,sample,looksValid,MODELS,KEYS_URL,WS_URL};
})();
