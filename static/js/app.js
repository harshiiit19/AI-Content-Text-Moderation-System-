// ═══ CLOCK ═══════════════════════════════════════════════
function updateClock(){
  const now=new Date();
  const el=document.getElementById('clock');
  if(el) el.textContent=now.toLocaleTimeString('en-US',{hour12:false});
}
setInterval(updateClock,1000);updateClock();

// ═══ TEXTAREA ════════════════════════════════════════════
const ta=document.getElementById('input-text');
if(ta){
  ta.addEventListener('input',()=>{
    document.getElementById('char-num').textContent=ta.value.length;
  });
  ta.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) analyzeText();
  });
}

// ═══ NAVIGATION ══════════════════════════════════════════
function showPage(name,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  el.classList.add('active');
  if(name==='performance') loadPerformance();
  if(name==='dataset') loadDataset();
  if(name==='history') loadHistoryPage();
  // Close mobile sidebar
  document.querySelector('.sidebar')?.classList.remove('open');
  document.querySelector('.overlay')?.classList.remove('active');
}

// ═══ MOBILE MENU ═════════════════════════════════════════
function toggleMenu(){
  document.querySelector('.sidebar')?.classList.toggle('open');
  document.querySelector('.overlay')?.classList.toggle('active');
}

// ═══ QUICK SAMPLES ═══════════════════════════════════════
function setSample(t){
  if(ta){ta.value=t;document.getElementById('char-num').textContent=t.length;}
}
function clearInput(){
  if(ta) ta.value='';
  document.getElementById('char-num').textContent='0';
  document.getElementById('result-card').style.display='none';
}

// ═══ ANALYZE ═════════════════════════════════════════════
async function analyzeText(){
  const text=ta.value.trim();
  if(!text) return;
  const btn=document.getElementById('analyze-btn');
  const spinner=document.getElementById('btn-spinner');
  const lbl=document.getElementById('btn-label');
  btn.disabled=true; spinner.style.display='block'; lbl.textContent='ANALYZING...';

  try{
    const res=await fetch('/predict',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text})
    });
    const d=await res.json();
    showResult(d);
    updateSessionStats();
    addHistoryItem(d);
  }catch(e){console.error(e);}
  finally{
    btn.disabled=false; spinner.style.display='none'; lbl.textContent='ANALYZE';
  }
}

function showResult(d){
  const card=document.getElementById('result-card');
  card.style.display='block';
  // Re-trigger animation
  card.style.animation='none';
  card.offsetHeight;
  card.style.animation='';

  const colors={0:'var(--red)',1:'var(--amber)',2:'var(--green)'};
  const dimColors={0:'var(--red-dim)',1:'var(--amber-dim)',2:'var(--green-dim)'};
  const icons={0:'✕',1:'⚠',2:'✓'};

  const c=colors[d.label];
  const dim=dimColors[d.label];

  const vIcon=document.getElementById('v-icon');
  vIcon.style.background=dim;
  vIcon.style.color=c;
  vIcon.style.borderColor=c;
  vIcon.style.border=`1px solid`;
  vIcon.style.borderColor=c;
  vIcon.textContent=icons[d.label];

  document.getElementById('v-name').style.color=c;
  document.getElementById('v-name').textContent=d.label_name.toUpperCase();
  document.getElementById('v-sub').textContent=`Confidence: ${d.confidence}%  ·  ${d.timestamp}`;
  document.getElementById('v-conf').textContent=d.confidence+'%';
  document.getElementById('v-conf').style.color=c;

  const fill=document.getElementById('meter-fill');
  fill.style.background=c;
  fill.style.width='0%';
  setTimeout(()=>{fill.style.width=d.confidence+'%';},80);

  const probs=d.probabilities;
  document.getElementById('p-hate').textContent=(probs['Hate Speech']||0)+'%';
  document.getElementById('p-offensive').textContent=(probs['Offensive']||0)+'%';
  document.getElementById('p-neither').textContent=(probs['Neither']||0)+'%';

  document.getElementById('m-words').textContent=d.word_count;
  document.getElementById('m-caps').textContent=d.caps_ratio+'%';
  document.getElementById('m-time').textContent=d.timestamp;
  document.getElementById('ct-text').textContent=d.clean_text||'(empty after preprocessing)';
}

// ═══ SESSION STATS ═══════════════════════════════════════
async function updateSessionStats(){
  try{
    const res=await fetch('/stats');
    const d=await res.json();
    animateCounter('s-total',d.total);
    animateCounter('s-hate',d.hate);
    animateCounter('s-offensive',d.offensive);
    animateCounter('s-neither',d.neither);
  }catch(e){}
}

function animateCounter(id,target){
  const el=document.getElementById(id);
  if(!el) return;
  const current=parseInt(el.textContent)||0;
  if(current===target) return;
  const duration=400;
  const start=performance.now();
  function step(now){
    const progress=Math.min((now-start)/duration,1);
    const ease=1-Math.pow(1-progress,3);
    el.textContent=Math.round(current+(target-current)*ease);
    if(progress<1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ═══ HISTORY ═════════════════════════════════════════════
let localHistory=[];
function addHistoryItem(d){
  localHistory.unshift(d);
  renderHistory();
}
function renderHistory(){
  const list=document.getElementById('history-list');
  document.getElementById('hist-count').textContent=localHistory.length;
  if(!localHistory.length){
    list.innerHTML='<div class="history-empty">No analyses yet — try analyzing some text</div>';
    return;
  }
  const colors={0:'var(--red)',1:'var(--amber)',2:'var(--green)'};
  const bgColors={0:'var(--red-dim)',1:'var(--amber-dim)',2:'var(--green-dim)'};
  list.innerHTML=localHistory.map(d=>`
    <div class="history-item" onclick="setSampleFromHistory('${escHtml(d.text)}')">
      <span class="h-dot" style="background:${colors[d.label]}"></span>
      <span class="h-text">${escHtml(d.text)}</span>
      <span class="h-badge" style="color:${colors[d.label]};background:${bgColors[d.label]}">${d.confidence}%</span>
      <span class="h-time">${d.timestamp}</span>
    </div>`).join('');
}
function setSampleFromHistory(t){
  if(ta){ta.value=t;document.getElementById('char-num').textContent=t.length;}
}
function escHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ═══ PERFORMANCE ═════════════════════════════════════════
let perfLoaded=false;
async function loadPerformance(){
  if(perfLoaded) return;
  try{
    const res=await fetch('/performance');
    const d=await res.json();

    document.getElementById('perf-acc').textContent=d.accuracy+'%';
    document.getElementById('perf-f1m').textContent=d.f1_macro+'%';
    document.getElementById('perf-f1w').textContent=d.f1_weighted+'%';

    // Confusion matrix
    const labels=['Hate Speech','Offensive','Neither'];
    const cm=d.confusion_matrix;
    let cmHtml=`<tr><th></th>${labels.map(l=>`<th>Pred: ${l}</th>`).join('')}</tr>`;
    cm.forEach((row,i)=>{
      cmHtml+=`<tr><td style="text-align:left;color:var(--text-secondary)">True: ${labels[i]}</td>`;
      row.forEach((v,j)=>{
        const cls=i===j?'cm-diag':'';
        cmHtml+=`<td class="${cls}">${v}</td>`;
      });
      cmHtml+='</tr>';
    });
    document.getElementById('cm-table').innerHTML=cmHtml;

    // Report table
    const metrics=['precision','recall','f1-score','support'];
    let rHtml=`<tr><th>Class</th>${metrics.map(m=>`<th>${m}</th>`).join('')}</tr>`;
    labels.forEach(lbl=>{
      const row=d.report[lbl]||{};
      rHtml+=`<tr><td>${lbl}</td>${metrics.map(m=>`<td>${row[m]!==undefined?row[m]:'-'}</td>`).join('')}</tr>`;
    });
    document.getElementById('report-table').innerHTML=rHtml;

    document.getElementById('perf-loading').style.display='none';
    document.getElementById('perf-content').style.display='block';
    perfLoaded=true;
  }catch(e){console.error(e);}
}

// ═══ DATASET ═════════════════════════════════════════════
async function loadDataset(){
  const tbody=document.getElementById('dataset-tbody');
  tbody.innerHTML='<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--text-muted);">Loading samples...</td></tr>';
  try{
    const res=await fetch('/dataset');
    const rows=await res.json();
    const colors={'Hate Speech':'var(--red)','Offensive':'var(--amber)','Neither':'var(--green)'};
    const bgc={'Hate Speech':'var(--red-dim)','Offensive':'var(--amber-dim)','Neither':'var(--green-dim)'};
    tbody.innerHTML=rows.map((r,i)=>`
      <tr>
        <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${i+1}</td>
        <td class="tweet-cell" title="${escHtml(r.tweet)}">${escHtml(r.tweet)}</td>
        <td><span class="label-badge" style="color:${colors[r.label]};background:${bgc[r.label]}">${r.label}</span></td>
      </tr>`).join('');
  }catch(e){
    tbody.innerHTML='<tr><td colspan="3" style="text-align:center;padding:40px;color:var(--red);">Failed to load</td></tr>';
  }
}

// ═══ HISTORY PAGE ════════════════════════════════════════
let historyPageData=[];
let historyFilter='all';

async function loadHistoryPage(){
  const tbody=document.getElementById('history-page-tbody');
  if(!tbody) return;
  tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">Loading history...</td></tr>';
  try{
    const [histRes,statsRes]=await Promise.all([fetch('/history'),fetch('/stats')]);
    historyPageData=await histRes.json();
    const stats=await statsRes.json();

    // Update summary cards
    document.getElementById('hp-total').textContent=stats.total||0;
    document.getElementById('hp-hate').textContent=stats.hate||0;
    document.getElementById('hp-offensive').textContent=stats.offensive||0;
    document.getElementById('hp-neither').textContent=stats.neither||0;

    renderHistoryPage();
  }catch(e){
    console.error(e);
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--red);">Failed to load history</td></tr>';
  }
}

function renderHistoryPage(){
  const tbody=document.getElementById('history-page-tbody');
  if(!tbody) return;

  let data=historyPageData;
  if(historyFilter==='hate') data=data.filter(d=>d.label===0);
  else if(historyFilter==='offensive') data=data.filter(d=>d.label===1);
  else if(historyFilter==='clean') data=data.filter(d=>d.label===2);

  if(!data.length){
    const msg=historyFilter==='all'?'No analyses yet — go to the Analyzer to get started':`No ${historyFilter} results found`;
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">${msg}</td></tr>`;
    return;
  }

  const colors={0:'var(--red)',1:'var(--amber)',2:'var(--green)'};
  const bgc={0:'var(--red-dim)',1:'var(--amber-dim)',2:'var(--green-dim)'};

  tbody.innerHTML=data.map((d,i)=>`
    <tr class="history-row" onclick="loadFromHistory(${i})" style="cursor:pointer;">
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${i+1}</td>
      <td class="tweet-cell" title="${escHtml(d.text)}">${escHtml(d.text)}</td>
      <td><span class="label-badge" style="color:${colors[d.label]};background:${bgc[d.label]}">${d.label_name}</span></td>
      <td style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:${colors[d.label]}">${d.confidence}%</td>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${d.word_count}</td>
      <td style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary)">${d.caps_ratio}%</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${d.timestamp}</td>
    </tr>`).join('');
}

function filterHistory(filter,el){
  historyFilter=filter;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderHistoryPage();
}

function loadFromHistory(idx){
  const data=historyPageData;
  let filtered=data;
  if(historyFilter==='hate') filtered=data.filter(d=>d.label===0);
  else if(historyFilter==='offensive') filtered=data.filter(d=>d.label===1);
  else if(historyFilter==='clean') filtered=data.filter(d=>d.label===2);
  const d=filtered[idx];
  if(!d) return;
  // Navigate to analyzer and fill in the text
  showPage('analyze',document.getElementById('nav-analyze'));
  if(ta){ta.value=d.text;document.getElementById('char-num').textContent=d.text.length;}
  showResult(d);
}

// ═══ HISTORY QUICK ANALYZE ═══════════════════════════════
async function historyQuickAnalyze(){
  const input=document.getElementById('hp-input');
  const text=(input?.value||'').trim();
  if(!text) return;

  const btn=document.getElementById('hp-analyze-btn');
  const spinner=document.getElementById('hp-btn-spinner');
  const lbl=document.getElementById('hp-btn-label');
  btn.disabled=true; spinner.style.display='block'; lbl.textContent='ANALYZING...';

  try{
    const res=await fetch('/predict',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text})
    });
    const d=await res.json();
    if(d.error){ console.error(d.error); return; }

    // Show flash result
    const colors={0:'var(--red)',1:'var(--amber)',2:'var(--green)'};
    const dimColors={0:'var(--red-dim)',1:'var(--amber-dim)',2:'var(--green-dim)'};
    const icons={0:'✕',1:'⚠',2:'✓'};

    const flash=document.getElementById('hp-flash-result');
    flash.style.display='flex';
    flash.style.animation='none'; flash.offsetHeight; flash.style.animation='resultIn .3s ease';

    const icon=document.getElementById('hp-flash-icon');
    icon.style.background=dimColors[d.label];
    icon.style.color=colors[d.label];
    icon.style.border='1px solid '+colors[d.label].replace('var(','').replace(')','');
    icon.style.borderColor=colors[d.label];
    icon.textContent=icons[d.label];

    document.getElementById('hp-flash-label').textContent=d.label_name.toUpperCase();
    document.getElementById('hp-flash-label').style.color=colors[d.label];
    document.getElementById('hp-flash-meta').textContent=`${d.word_count} words · CAPS ${d.caps_ratio}% · ${d.timestamp}`;
    document.getElementById('hp-flash-conf').textContent=d.confidence+'%';
    document.getElementById('hp-flash-conf').style.color=colors[d.label];

    // Sync with analyzer's local history
    addHistoryItem(d);
    updateSessionStats();

    // Refresh history page data & stats
    await loadHistoryPage();

    // Clear input
    input.value='';
  }catch(e){console.error(e);}
  finally{
    btn.disabled=false; spinner.style.display='none'; lbl.textContent='ANALYZE';
  }
}
