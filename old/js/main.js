/* orim · main.js
 * Starts the app.
 */
'use strict';
setTheme(LS.get('mab.theme','system'));
setEmode(state.emode);
renderTools();
$('#lib').hidden=!state.libOpen;
board.querySelector('#defs').innerHTML=markerDefs(PAL_LIVE,'L');
setMode(state.mode);
loadIcons();
Boards.init();
if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>{ mcache.clear(); reparse(); R.sig.clear(); render(); });
getDownloads();
