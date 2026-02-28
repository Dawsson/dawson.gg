import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import { TECHNOLOGIES, CATEGORY_LABELS } from "../data.ts";

const FILTER_SCRIPT = `var activeCat='featured';function norm(s){return s.replace(/[-_]/g,' ').replace(/\\s+/g,' ')}function fuzzyWord(w,t){if(!w)return 0;var a=norm(w),b=norm(t),i=b.indexOf(a);if(i!==-1)return 1+(i===0?.2:0);var tw=b.split(' ');for(var j=0;j<tw.length;j++)if(tw[j].indexOf(a)===0)return.95;if(a.length<=3)return 0;var s=[a];if(a.endsWith('ing'))s.push(a.slice(0,-3),a.slice(0,-3)+'e',a.slice(0,-3)+'ed');if(a.endsWith('ed'))s.push(a.slice(0,-2),a.slice(0,-2)+'ing');if(a.endsWith('s')&&a.length>4)s.push(a.slice(0,-1));for(var k=1;k<s.length;k++)if(s[k].length>=3&&b.indexOf(s[k])!==-1)return.85;var qi=0,sc=0,con=0,li=-2;for(var ti=0;ti<b.length&&qi<a.length;ti++){if(b[ti]===a[qi]){qi++;con=ti===li+1?con+1:1;sc+=con+(ti===0?2:0);li=ti}}if(qi<a.length)return 0;var lp=a.length/Math.max(b.length,1);return(sc/(a.length*4))*(.5+.5*lp)}function searchScore(q,f){var w=q.trim().split(/\\s+/).filter(function(x){return x.length>0});if(!w.length)return 0;var t=0;for(var i=0;i<w.length;i++){var b=0;for(var j=0;j<f.length;j++){var s=fuzzyWord(w[i],f[j].text)*f[j].weight;if(s>b)b=s}if(!b)return 0;t+=b}return t/w.length}function syncToUrl(){var p=new URLSearchParams,q=document.getElementById('tech-filter').value||'';if(q)p.set('q',q);if(activeCat!=='featured')p.set('category',activeCat);var s=p.toString();history.replaceState(null,'',location.pathname+(s?'?'+s:''))}function filterCat(c){activeCat=c;document.querySelectorAll('.cat-btn').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-cat')===c)});applyFilter();syncToUrl()}function applyFilter(){var t0=performance.now(),q=(document.getElementById('tech-filter').value||'').toLowerCase(),has=q.length>0,vis=0,items=document.querySelectorAll('.tech-item'),scored=[];items.forEach(function(el){var n=el.getAttribute('data-name')||'',c=el.getAttribute('data-cat')||'',d=el.getAttribute('data-desc')||'',s=el.getAttribute('data-slug')||'',k=el.getAttribute('data-kw')||'',f=el.getAttribute('data-featured')==='true';if(has){var sc=searchScore(q,[{text:n,weight:1},{text:s,weight:.8},{text:k,weight:.7},{text:d,weight:.6},{text:c,weight:.5}]);scored.push({el:el,show:sc>0,score:sc});return}var sh=false;if(activeCat==='featured')sh=f;else if(activeCat==='all')sh=true;else sh=c===activeCat;scored.push({el:el,show:sh,score:0})});if(has){scored.sort(function(a,b){return b.score-a.score});var g=document.getElementById('tech-grid');scored.forEach(function(s){g.appendChild(s.el)})}scored.forEach(function(s){s.el.style.display=s.show?'':'none';if(s.show)vis++});var el=performance.now()-t0;document.getElementById('tech-count').textContent=vis+' shown';document.getElementById('tech-time').textContent=has?(el<1?'< 1ms':el.toFixed(1)+'ms'):''}document.getElementById('tech-filter').addEventListener('input',function(){applyFilter();syncToUrl()});(function(){var p=new URLSearchParams(location.search),q=p.get('q'),c=p.get('category');if(q)document.getElementById('tech-filter').value=q;if(c){activeCat=c;document.querySelectorAll('.cat-btn').forEach(function(b){b.classList.toggle('active',b.getAttribute('data-cat')===c)})}if(q||c)applyFilter()})();`;

const categories = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
  key,
  label,
}));

export const Technologies: FC = () => (
  <section class="section" id="technologies">
    <h2 class="section-label">Technologies</h2>
    <div class="tech-controls">
      <div class="tech-controls-top">
        <input
          type="text"
          id="tech-filter"
          class="tech-filter-input"
          placeholder={`Search ${TECHNOLOGIES.length} technologies...`}
        />
        <span class="tech-count" id="tech-count" />
        <span class="tech-time" id="tech-time" />
      </div>
      <div class="cat-buttons">
        <button
          class="cat-btn active"
          data-cat="featured"
          onclick="filterCat('featured')"
        >
          Featured
        </button>
        <button
          class="cat-btn"
          data-cat="all"
          onclick={`filterCat('all')`}
        >
          All {TECHNOLOGIES.length}
        </button>
        <span class="cat-divider" />
        {categories.map((cat) => (
          <button
            class="cat-btn"
            data-cat={cat.key}
            onclick={`filterCat('${cat.key}')`}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
    <div class="tech-grid" id="tech-grid">
      {TECHNOLOGIES.map((t) => (
        <div
          class="tech-item"
          data-name={t.name.toLowerCase()}
          data-cat={t.category}
          data-slug={t.slug}
          data-desc={t.description.toLowerCase()}
          data-kw={(t.keywords || "").toLowerCase()}
          data-featured={String(t.featured)}
          title={`${t.name} — ${t.description}`}
          style={t.featured ? undefined : "display:none"}
        >
          <span class="tech-name">{t.name}</span>
          <span class="tech-cat">{CATEGORY_LABELS[t.category]}</span>
        </div>
      ))}
    </div>
    <script>{raw(FILTER_SCRIPT)}</script>
  </section>
);
