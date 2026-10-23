/* orim · hit-test.js
 * Finds the node or frame under a point.
 */
'use strict';
function nodeAt(p,pad=0,exclude){
  const m=state.model; if(!m) return null;
  for(let k=m.nodeOrder.length-1;k>=0;k--){ const n=m.nodes.get(m.nodeOrder[k]); if(!n||(exclude&&exclude.has(n.id))) continue; if(p.x>=n.x-pad&&p.x<=n.x+n.w+pad&&p.y>=n.y-pad&&p.y<=n.y+n.h+pad) return n.id; }
  return null;
}
function isDesc(m,gid,anc){ let p=m.groups.get(gid); let k=0; while(p&&k++<60){ if(p.id===anc) return true; p=p.parent?m.groups.get(p.parent):null; } return false; }
function groupAt(p,excludeNodes,excludeGroup){
  const m=state.model; if(!m) return null;
  const boxes=groupBoxes(m,excludeNodes&&excludeNodes.size?excludeNodes:null);
  let best=null,ba=Infinity;
  for(const [gid,b] of boxes){
    if(excludeGroup&&(gid===excludeGroup||isDesc(m,gid,excludeGroup))) continue;
    if(p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h){ const a=b.w*b.h; if(a<ba){ba=a;best=gid;} }
  }
  return best;
}

// What a connector end can attach to at p: a shape first, otherwise the frame under the point.
// Frames that hold the source are skipped, so dropping inside your own frame still makes a new shape.
function linkAt(p,pad,from){
  const m=state.model; if(!m) return null;
  const n=nodeAt(p,pad||0,from?new Set([from]):null); if(n) return n;
  const boxes=state.boxes||groupBoxes(m); let best=null,ba=Infinity;
  const srcGroup=from&&(m.nodes.has(from)?m.nodes.get(from).group:from);
  for(const [gid,b] of boxes){
    if(gid===from) continue;
    if(srcGroup&&(gid===srcGroup||isDesc(m,srcGroup,gid))) continue;
    if(from&&m.groups.has(from)&&isDesc(m,gid,from)) continue;
    if(p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y-(PAL_LIVE.frameOut?30:0)&&p.y<=b.y+b.h){ const a=b.w*b.h; if(a<ba){ ba=a; best=gid; } }
  }
  return best;
}

// A frame's border or title under p (not its empty inside), so frames can start connections
// without stealing plain arrows drawn inside them.
function frameEdgeAt(p,tol){
  const m=state.model; if(!m||!state.boxes) return null; tol=tol||10/state.view.z;
  const out=PAL_LIVE.frameOut; let best=null,ba=Infinity;
  for(const [gid,b] of state.boxes){
    if(!m.groups.has(gid)) continue;
    const title=out?(p.y>=b.y-30&&p.y<b.y&&p.x>=b.x&&p.x<=b.x+Math.min(b.w,260)):(p.y>=b.y&&p.y<=b.y+30&&p.x>=b.x&&p.x<=b.x+b.w);
    const inX=p.x>=b.x-tol&&p.x<=b.x+b.w+tol, inY=p.y>=b.y-tol&&p.y<=b.y+b.h+tol;
    const edge=inX&&inY&&(Math.abs(p.x-b.x)<=tol||Math.abs(p.x-b.x-b.w)<=tol||Math.abs(p.y-b.y)<=tol||Math.abs(p.y-b.y-b.h)<=tol);
    if(!title&&!edge) continue;
    const a=b.w*b.h; if(a<ba){ ba=a; best=gid; }
  }
  return best;
}
