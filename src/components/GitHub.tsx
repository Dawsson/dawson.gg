import type { FC } from "hono/jsx";
import { raw } from "hono/html";
import type { ContribData } from "../contributions.ts";

const LEVEL_COLORS: Record<string, { light: string; dark: string }> = {
  "0": { light: "#ebedf0", dark: "#1c1917" },
  "1": { light: "#9be9a8", dark: "#0e4429" },
  "2": { light: "#40c463", dark: "#006d32" },
  "3": { light: "#30a14e", dark: "#26a641" },
  "4": { light: "#216e39", dark: "#39d353" },
};

const THEME_SCRIPT = `(function(){function a(d){var t=d?'data-dark':'data-light';document.querySelectorAll('.contrib-cell').forEach(function(r){r.setAttribute('fill',r.getAttribute(t)||'#ebedf0')});}a(window.matchMedia('(prefers-color-scheme: dark)').matches);window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',function(e){a(e.matches)});})();`;

export const GitHub: FC<{ data: ContribData }> = ({ data }) => {
  const cellSize = 10;
  const cellGap = 3;
  const step = cellSize + cellGap;
  const maxWeek = Math.max(...data.cells.map((c) => c.week));
  const totalW = (maxWeek + 1) * step;
  const totalH = 7 * step - cellGap;

  const rects = data.cells
    .map((c) => {
      const x = c.week * step;
      const y = c.day * step;
      const colors = LEVEL_COLORS[String(c.level)] ?? LEVEL_COLORS["0"]!;
      return `<rect class="contrib-cell" x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" data-light="${colors.light}" data-dark="${colors.dark}"><title>${c.date}</title></rect>`;
    })
    .join("");

  return (
    <section class="section" id="github">
      <div class="github-header">
        <div class="github-info">
          <h2 class="section-label" style="margin-bottom:0">
            GitHub
          </h2>
          <span class="github-stat">
            {data.total.toLocaleString()} contributions in the last year
          </span>
        </div>
        <a
          href="https://github.com/Dawsson"
          class="github-profile-link"
          target="_blank"
          rel="noopener"
        >
          @Dawsson &rarr;
        </a>
      </div>
      <div class="github-graph">
        {raw(
          `<svg viewBox="0 0 ${totalW} ${totalH}" id="contrib-svg">${rects}</svg>`,
        )}
      </div>
      <script>{raw(THEME_SCRIPT)}</script>
    </section>
  );
};
