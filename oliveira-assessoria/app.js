const API_URL = window.DASHBOARD_API_URL;

const COL = {
  date:        "Date",
  spend:       "Spend (Cost, Amount Spent)",
  reach:       "Reach (Estimated)",
  impressions: "Impressions",
  clicks:      "Action Link Clicks",
  leads:       "Results",
  cpr:         "Cost per Result",
  cpc:         "CPC (Cost per Click)",
  ctr:         "CTR (Clickthrough Rate)",
  ad:          "Ad Name",
  adset:       "Adset Name",
  post:        "Instagram Permalink URL",
  thumb:       "Thumbnail URL",
  cpm:         "CPM (Cost per 1000 Impressions)",
  campaign:    "Campaign Name",
  ret15:       "Video Play Retention 0 To 15s Actions",
  view25:      "Video 25 Percent Watched Actions",
  view50:      "Video 50 Percent Watched Actions",
  view75:      "Video 75 Percent Watched Actions",
  view95:      "Video 95 Percent Watched Actions"
};

let rawRows = [];
let trendChart;
let renderedCreativeLimit = 16;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function n(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  const parsed = Number(String(value).replace("R$", "").replace("%", "").replace(/\./g, "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function d(value) {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLabel(value) {
  const date = d(value);
  if (!date) return value || "";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function normalize(row) {
  const spend       = n(row[COL.spend]);
  const impressions = n(row[COL.impressions]);
  const clicks      = n(row[COL.clicks]);
  const leads       = n(row[COL.leads]);
  const ret15       = n(row[COL.ret15]);
  const view25      = n(row[COL.view25]);
  const view50      = n(row[COL.view50]);
  const view75      = n(row[COL.view75]);
  const view95      = n(row[COL.view95]);
  const isVideo     = view25 > 0 || view50 > 0 || view75 > 0 || ret15 > 0;

  return {
    date: row[COL.date],
    spend,
    reach:       n(row[COL.reach]),
    impressions,
    clicks,
    leads,
    cpl:         leads       ? spend / leads                : n(row[COL.cpr]),
    cpc:         clicks      ? spend / clicks               : n(row[COL.cpc]),
    ctr:         impressions ? (clicks / impressions) * 100 : n(row[COL.ctr]),
    cpm:         impressions ? (spend / impressions) * 1000 : n(row[COL.cpm]),
    ad:          row[COL.ad]       || "Sem nome",
    adset:       row[COL.adset]    || "Sem conjunto",
    campaign:    row[COL.campaign] || "Sem campanha",
    post:        row[COL.post]     || "",
    thumb:       row[COL.thumb]    || "",
    ret15,
    view25,
    view50,
    view75,
    view95,
    isVideo
  };
}

function creativeName(a) {
  if (a.post) return `<a class="creative-link" href="${a.post}" target="_blank" rel="noopener">${a.name}</a>`;
  return a.name;
}

// Criativos: agrupado por Ad Name — mesmo criativo em múltiplos adsets é consolidado
function aggregateByAd(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.ad)) {
      map.set(r.ad, {
        name:    r.ad,
        campaign: r.campaign,
        adset:   r.adset,
        post:    r.post,
        thumb:   r.thumb,
        spend: 0, reach: 0, impressions: 0, clicks: 0, leads: 0,
        ret15: 0, view25: 0, view50: 0, view75: 0, view95: 0,
        isVideo: false
      });
    }
    const a = map.get(r.ad);
    a.spend       += r.spend;
    a.reach       += r.reach;
    a.impressions += r.impressions;
    a.clicks      += r.clicks;
    a.leads       += r.leads;
    a.ret15       += r.ret15;
    a.view25      += r.view25;
    a.view50      += r.view50;
    a.view75      += r.view75;
    a.view95      += r.view95;
    if (r.isVideo)        a.isVideo = true;
    if (!a.thumb && r.thumb) a.thumb = r.thumb;
    if (!a.post  && r.post)  a.post  = r.post;
  }

  const ads        = [...map.values()];
  const totalLeads = ads.reduce((s, a) => s + a.leads, 0);
  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);

  return ads.map(a => {
    const ctr = a.impressions ? (a.clicks / a.impressions) * 100 : 0;
    const cpc = a.clicks      ? a.spend / a.clicks               : 0;
    const cpl = a.leads       ? a.spend / a.leads                : 0;
    const cpm = a.impressions ? (a.spend / a.impressions) * 1000 : 0;

    // Retenção de vídeo — usa ret15 como base; se vazio, usa view25 como proxy
    const retBase    = a.ret15 > 0 ? a.ret15 : a.view25;
    const retRate25  = retBase  ? (a.view25 / retBase) * 100 : 0;
    const retRate50  = retBase  ? (a.view50 / retBase) * 100 : 0;
    const retRate75  = retBase  ? (a.view75 / retBase) * 100 : 0;
    const retRate95  = retBase  ? (a.view95 / retBase) * 100 : 0;

    return {
      ...a, ctr, cpc, cpl, cpm,
      retRate25, retRate50, retRate75, retRate95,
      leadShare:  totalLeads ? (a.leads / totalLeads) * 100 : 0,
      spendShare: totalSpend ? (a.spend / totalSpend) * 100 : 0
    };
  });
}

function groupByDate(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.date)) map.set(r.date, { date: r.date, spend: 0, leads: 0 });
    const item = map.get(r.date);
    item.spend += r.spend;
    item.leads += r.leads;
  }
  return [...map.values()].sort((a, b) => d(a.date) - d(b.date));
}

function currentRows() {
  const start    = document.querySelector("#startDate").value;
  const end      = document.querySelector("#endDate").value;
  const campaign = document.querySelector("#campaignFilter").value;
  const adset    = document.querySelector("#adsetFilter").value;

  return rawRows.filter(r => {
    const date = d(r.date);
    if (start) {
      const [sy, sm, sd] = start.split("-").map(Number);
      if (date < new Date(sy, sm - 1, sd)) return false;
    }
    if (end) {
      const [ey, em, ed] = end.split("-").map(Number);
      if (date > new Date(ey, em - 1, ed, 23, 59, 59)) return false;
    }
    if (campaign && r.campaign !== campaign) return false;
    if (adset    && r.adset    !== adset)    return false;
    return true;
  });
}

function avg(values) {
  const valid = values.filter(v => Number.isFinite(v) && v > 0);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
}

// Mediana — mais robusta que média quando há outliers de CPL (1 lead com CPL muito baixo)
function median(values) {
  const valid = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!valid.length) return 0;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

// Score Tess v2 — volume e custo lideram; CTR/CPC só pesam com volume suficiente
function scoreAds(ads) {
  // CPL de referência: mediana dos criativos com >= 2 leads
  // Se não há criativos com >= 2 leads, usa mediana de todos com leads
  const adsWithMinLeads = ads.filter(a => a.leads >= 2);
  const refCplPool      = adsWithMinLeads.length >= 2 ? adsWithMinLeads : ads.filter(a => a.leads > 0);
  const avgCpl          = median(refCplPool.map(a => a.cpl));

  const avgCtr     = avg(ads.map(a => a.ctr));
  const avgCpc     = avg(ads.map(a => a.cpc));
  const maxLeads   = Math.max(...ads.map(a => a.leads), 1);
  const maxShare   = Math.max(...ads.map(a => a.leadShare), 1);

  return ads.map(a => {
    // --- Volume de leads: 45pts ---
    const volumeScore = Math.min((a.leads / maxLeads) * 45, 45);

    // --- CPL (eficiência): 30pts — só ativo se tem leads ---
    const cplScore = a.leads > 0 && avgCpl > 0
      ? Math.min((avgCpl / a.cpl) * 30, 36)
      : 0;

    // --- Participação nos leads totais: 10pts ---
    const shareScore = Math.min((a.leadShare / maxShare) * 10, 10);

    // --- CTR: 10pts — só conta com impressões >= 300 ---
    const ctrScore = a.impressions >= 300 && avgCtr > 0
      ? Math.min((a.ctr / avgCtr) * 10, 12)
      : 0;

    // --- CPC: 5pts — só conta com cliques >= 10 ---
    const cpcScore = a.clicks >= 10 && avgCpc > 0
      ? Math.min((avgCpc / a.cpc) * 5, 6)
      : 0;

    let score = Math.round(Math.max(0, Math.min(100,
      volumeScore + cplScore + shareScore + ctrScore + cpcScore
    )));

    // Penalizações
    if (a.impressions < 100)                              score = Math.min(score, 50); // dados insuficientes
    if (a.spend > 5  && a.leads === 0)                   score = Math.min(score, 30); // gasto alto sem lead
    if (a.impressions >= 500 && a.leads === 0)           score = Math.min(score, 35); // volume suficiente sem resultado

    return { ...a, score, className: classFromScore(score), quadrant: quadrant(a, avgCtr, avgCpl), refCpl: avgCpl };
  });
}

function classFromScore(score) {
  if (score >= 90) return "ELITE";
  if (score >= 75) return "FORTE";
  if (score >= 60) return "PROMISSOR";
  if (score >= 40) return "REVISAR";
  return "PAUSAR";
}

function quadrant(a, avgCtr, avgCpl) {
  if (a.leads === 0)                          return "PAUSAR";
  if (a.leads === 1)                          return "TESTAR";
  if (a.leads >= 2 && a.cpl <= avgCpl)        return "ESCALAR";
  if (a.leads >= 2 && a.cpl > avgCpl)         return "OTIMIZAR";
  return "PAUSAR";
}

function badgeClass(className) {
  return className.toLowerCase();
}

function recommendation(a) {
  if (a.className === "ELITE")     return "Escalar orçamento e produzir novas variações desse padrão.";
  if (a.className === "FORTE")     return "Aumentar verba gradualmente e acompanhar estabilidade do CPL.";
  if (a.className === "PROMISSOR") return "Criar novas versões de headline, imagem e chamada.";
  if (a.className === "REVISAR")   return "Revisar copy, oferta ou segmentação antes de escalar.";
  return "Pausar ou reconstruir o criativo com novo ângulo.";
}

function renderKpis(rows, ads) {
  const spend       = rows.reduce((s, r) => s + r.spend, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks      = rows.reduce((s, r) => s + r.clicks, 0);
  const leads       = rows.reduce((s, r) => s + r.leads, 0);
  const ctr         = impressions ? clicks / impressions * 100 : 0;
  const cpl         = leads ? spend / leads : 0;
  const elite       = ads.filter(a => a.className === "ELITE").length;

  const items = [
    ["Investimento",         brl.format(spend)],
    ["Leads",                num.format(leads)],
    ["CPL médio",            leads ? brl.format(cpl) : "—"],
    ["CTR médio",            `${pct.format(ctr)}%`],
    ["Criativos analisados", num.format(ads.length)],
    ["Criativos Elite",      num.format(elite)]
  ];

  document.querySelector("#kpis").innerHTML = items
    .map(([l, v]) => `<article class="kpi"><span>${l}</span><strong>${v}</strong></article>`)
    .join("");
}

function renderTrend(rows) {
  const daily  = groupByDate(rows);
  const labels = daily.map(x => formatDateLabel(x.date));
  if (trendChart) trendChart.destroy();

  trendChart = new Chart(document.querySelector("#trendChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Valor investido", data: daily.map(x => x.spend), yAxisID: "y",  tension: 0.42, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: false },
        { label: "Leads",           data: daily.map(x => x.leads), yAxisID: "y1", tension: 0.42, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      elements: { line: { capBezierPoints: true } },
      plugins: {
        legend: { position: "top", align: "end", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 16 } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.label === "Valor investido" ? `Valor investido: ${brl.format(ctx.raw)}` : `Leads: ${num.format(ctx.raw)}` } }
      },
      scales: {
        x:  { ticks: { maxTicksLimit: window.innerWidth < 680 ? 5 : 9, maxRotation: 0, autoSkip: true }, grid: { display: false } },
        y:  { type: "linear", position: "left",  beginAtZero: true, title: { display: window.innerWidth > 680, text: "Valor investido" }, ticks: { maxTicksLimit: 4, callback: v => brl.format(v).replace(",00", "") }, grid: { color: "rgba(255,255,255,.08)" } },
        y1: { type: "linear", position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: window.innerWidth > 680, text: "Leads" }, ticks: { precision: 0, maxTicksLimit: 4 } }
      }
    }
  });
}

function cardImage(a) {
  return a.thumb ? `<img src="${a.thumb}" alt="${a.name}" loading="lazy" decoding="async" fetchpriority="low" onerror="this.style.display='none'">` : "";
}

// Barra de retenção de vídeo
function retentionBar(label, value, colorClass) {
  const w = Math.min(Math.round(value), 100);
  return `
    <div class="ret-row">
      <span class="ret-label">${label}</span>
      <div class="ret-track">
        <div class="ret-fill ${colorClass}" style="width:${w}%"></div>
      </div>
      <span class="ret-value">${pct.format(value)}%</span>
    </div>`;
}

function renderVideoRetention(ads) {
  const el = document.querySelector("#videoRetention");
  if (!el) return;

  const videoAds = ads
    .filter(a => a.isVideo && (a.ret15 > 0 || a.view25 > 0))
    .sort((a, b) => b.leads - a.leads || b.view25 - a.view25);

  if (!videoAds.length) {
    el.innerHTML = `<p class="muted">Nenhum dado de retenção de vídeo disponível no período filtrado.</p>`;
    return;
  }

  el.innerHTML = videoAds.map(a => `
    <article class="ret-card">
      <div class="ret-head">
        <div>
          <h3>${creativeName(a)}</h3>
          <small>${a.adset}</small>
        </div>
        <div class="ret-kpis">
          <span><b>${num.format(a.ret15 > 0 ? a.ret15 : a.view25)}</b> ${a.ret15 > 0 ? "viram 15s" : "viram 25%"}</span>
          <span><b>${num.format(a.leads)}</b> leads</span>
        </div>
      </div>
      <div class="ret-bars">
        ${retentionBar("25%", a.retRate25, "ret-c1")}
        ${retentionBar("50%", a.retRate50, "ret-c2")}
        ${retentionBar("75%", a.retRate75, "ret-c3")}
        ${retentionBar("95%", a.retRate95, "ret-c4")}
      </div>
      <p class="ret-note">${retentionInsight(a)}</p>
    </article>`).join("");
}

function retentionInsight(a) {
  if (a.retRate75 >= 60) return `Retenção forte até 75% — o vídeo mantém atenção. Prioridade para escalar.`;
  if (a.retRate50 >= 60 && a.retRate75 < 40) return `Queda acentuada após 50% — revisar a segunda metade do vídeo.`;
  if (a.retRate25 < 50) return `Alta evasão nos primeiros segundos — testar novo gancho de abertura.`;
  if (a.retRate50 >= 50) return `Retenção mediana. Testar CTA mais cedo e abertura mais direta.`;
  return `Retenção abaixo da média. Revisar ritmo, gancho e promessa do vídeo.`;
}

function hallGroupedInsight(tags, a) {
  if (tags.length > 1) {
    const cleanTags = tags.map(t => t.replace(/[🏆💰👀📈⭐]/g, "").trim()).join(", ");
    return `Este criativo acumulou múltiplos destaques: <b>${cleanTags}</b>. Sugestão: usar como referência principal para novas variações.`;
  }
  const title = tags[0] || "";
  if (title.includes("Melhor Score")) return `Eleito pelo melhor equilíbrio entre <b>volume, CPL e eficiência</b>. Sugestão: criar novas variações mantendo o mesmo ângulo principal.`;
  if (title.includes("Menor CPL"))    return `Eleito por gerar leads com o <b>menor custo</b> do período. Sugestão: testar novas aberturas visuais com a mesma promessa.`;
  if (title.includes("Maior CTR"))    return `Eleito por ter alta capacidade de <b>parar o scroll</b>. Sugestão: usar esse gancho em novos criativos mais orientados para conversão.`;
  if (title.includes("Maior Volume")) return `Eleito por gerar o maior volume: <b>${num.format(a.leads)} leads</b>. Sugestão: duplicar o formato e testar novas versões de copy.`;
  return `Criativo relevante no período. Sugestão: observar o padrão visual e testar variações.`;
}

function renderHall(ads) {
  const validAds        = ads.filter(a => a.spend > 0 || a.leads > 0 || a.impressions > 0);
  const withLead        = validAds.filter(a => a.leads > 0);
  const withImpressions = validAds.filter(a => a.impressions > 100);

  const winners = [
    ["🏆 Melhor Score", [...validAds].sort((a, b) => b.score - a.score || b.leads - a.leads)[0]],
    ["💰 Menor CPL",    [...withLead].sort((a, b) => a.cpl - b.cpl || b.leads - a.leads)[0]],
    ["👀 Maior CTR",    [...withImpressions].sort((a, b) => b.ctr - a.ctr || b.leads - a.leads)[0]],
    ["📈 Maior Volume", [...withLead].sort((a, b) => b.leads - a.leads || b.score - a.score)[0]]
  ].filter(([_, ad]) => ad);

  const grouped = new Map();
  winners.forEach(([tag, ad]) => {
    if (!grouped.has(ad.name)) grouped.set(ad.name, { ad, tags: [] });
    grouped.get(ad.name).tags.push(tag);
  });

  let items = [...grouped.values()];
  if (items.length < 3) {
    const used     = new Set(items.map(i => i.ad.name));
    const fallback = [...validAds].filter(a => !used.has(a.name)).sort((a, b) => b.score - a.score || b.leads - a.leads);
    while (items.length < 3 && fallback.length) items.push({ ad: fallback.shift(), tags: ["⭐ Destaque Estratégico"] });
  }

  document.querySelector("#hallOfFame").innerHTML = items.map(({ ad: a, tags }) => `
    <article class="fame-card">
      ${cardImage(a)}
      <div class="fame-body">
        <div class="fame-tags">
          ${tags.map(tag => `<span class="badge ${badgeClass(a.className)}">${tag}</span>`).join("")}
          <span class="badge ${badgeClass(a.className)}">${a.className}</span>
        </div>
        <h3>${creativeName(a)}</h3>
        <p>${a.campaign}</p>
        <div class="mini-metrics">
          <div class="mini"><small>Score</small><b>${a.score}/100</b></div>
          <div class="mini"><small>CPL</small><b>${a.leads ? brl.format(a.cpl) : "—"}</b></div>
          <div class="mini"><small>CTR</small><b>${pct.format(a.ctr)}%</b></div>
          <div class="mini"><small>Leads</small><b>${num.format(a.leads)}</b></div>
        </div>
        <p class="fame-insight">${hallGroupedInsight(tags, a)}</p>
        ${a.post ? `<a class="open-link" href="${a.post}" target="_blank" rel="noopener">Abrir no Instagram</a>` : ""}
      </div>
    </article>`).join("");
}

function renderQuadrantBoard(ads) {
  const config = [
    { key: "ESCALAR",  title: "Escalar",  desc: "2+ leads · CPL abaixo da mediana", action: "Criativos com volume real e custo eficiente. Prioridade para aumentar verba.", badge: "elite" },
    { key: "OTIMIZAR", title: "Otimizar", desc: "2+ leads · CPL acima da mediana",  action: "Geram resultado mas estão caros. Testar novas versões para reduzir CPL.",     badge: "forte" },
    { key: "TESTAR",   title: "Testar",   desc: "1 lead · volume insuficiente",      action: "Ainda pouco volume para decidir. Aguardar mais dados antes de escalar ou pausar.", badge: "promissor" },
    { key: "PAUSAR",   title: "Pausar",   desc: "0 leads · sem resultado",           action: "Nenhum lead gerado. Revisar criativo, oferta ou segmentação.",                 badge: "pausar" }
  ];

  const html = config.map(group => {
    const items = ads
      .filter(a => a.quadrant === group.key)
      .sort((a, b) => group.key === "PAUSAR" ? b.spend - a.spend : b.score - a.score)
      .slice(0, 3);

    const list = items.length
      ? items.map(a => `
          <div class="quadrant-item">
            <div>
              <b>${creativeName(a)}</b>
              <span>Score ${a.score}/100 · CTR ${pct.format(a.ctr)}% · CPL ${a.leads ? brl.format(a.cpl) : "—"} · ${num.format(a.leads)} leads</span>
            </div>
            ${a.post ? `<a href="${a.post}" target="_blank" rel="noopener">Abrir</a>` : ""}
          </div>`).join("")
      : `<div class="quadrant-empty">Nenhum criativo nesta categoria no período filtrado.</div>`;

    return `
      <div class="quadrant-card ${group.key.toLowerCase()}">
        <div class="quadrant-head"><span class="badge ${group.badge}">${group.title}</span><small>${group.desc}</small></div>
        <p>${group.action}</p>
        <div class="quadrant-list">${list}</div>
      </div>`;
  }).join("");

  const el = document.querySelector("#quadrantBoard");
  if (el) el.innerHTML = html;
}

function renderActionBoard(ads) {
  const avgCtr = avg(ads.map(a => a.ctr));
  const avgCpl = avg(ads.map(a => a.cpl));

  const getAction = (a) => {
    const highCtr = a.ctr >= avgCtr;
    const lowCpl  = a.cpl > 0 && a.cpl <= avgCpl;
    if (highCtr && lowCpl)  return "ESCALAR";
    if (highCtr && !lowCpl) return "TESTAR";
    if (!highCtr && lowCpl) return "OTIMIZAR";
    return "PAUSAR";
  };

  const config = [
    { key: "ESCALAR",  css: "escalar",  label: "Escalar",  desc: "2+ leads · CPL abaixo da mediana", text: "Criativos com volume real e custo eficiente. Prioridade para aumentar verba." },
    { key: "OTIMIZAR", css: "otimizar", label: "Otimizar", desc: "2+ leads · CPL acima da mediana",   text: "Geram resultado mas estão caros. Testar novas versões para reduzir CPL." },
    { key: "TESTAR",   css: "testar",   label: "Testar",   desc: "1 lead · volume insuficiente",       text: "Ainda pouco volume para decidir. Aguardar mais dados antes de escalar ou pausar." },
    { key: "PAUSAR",   css: "pausar",   label: "Pausar",   desc: "0 leads · sem resultado",            text: "Nenhum lead gerado. Revisar criativo, oferta ou segmentação." }
  ];

  const html = config.map(group => {
    const badgeCss = group.css === "pausar" ? "pausar" : group.css === "testar" ? "promissor" : group.css === "otimizar" ? "forte" : "elite";
    const items = ads
      .filter(a => (a.spend > 0 || a.leads > 0 || a.impressions > 0) && getAction(a) === group.key)
      .sort((a, b) => group.key === "PAUSAR" ? b.spend - a.spend : b.score - a.score || b.leads - a.leads)
      .slice(0, 3);

    const list = items.length
      ? items.map(a => `
          <div class="action-item">
            <div>
              <b>${creativeName(a)}</b>
              <span>Score ${a.score}/100 · CTR ${pct.format(a.ctr)}% · CPL ${a.leads ? brl.format(a.cpl) : "—"} · ${num.format(a.leads)} leads</span>
            </div>
            ${a.post ? `<a href="${a.post}" target="_blank" rel="noopener">Abrir</a>` : ""}
          </div>`).join("")
      : `<div class="action-empty">Nenhum criativo nessa categoria no período filtrado.</div>`;

    return `
      <div class="action-col ${group.css}">
        <div class="action-top"><span class="badge ${badgeCss}">${group.label}</span><small>${group.desc}</small></div>
        <p class="action-desc">${group.text}</p>
        <div class="action-items">${list}</div>
      </div>`;
  }).join("");

  const el = document.querySelector("#actionBoard");
  if (el) el.innerHTML = html;
}

function renderInsights(ads) {
  const totalLeads    = ads.reduce((s, a) => s + a.leads, 0);
  const totalSpend    = ads.reduce((s, a) => s + a.spend, 0);
  const eliteAds      = ads.filter(a => a.className === "ELITE");
  const eliteLeads    = eliteAds.reduce((s, a) => s + a.leads, 0);
  const eliteSpend    = eliteAds.reduce((s, a) => s + a.spend, 0);
  const waste         = ads.filter(a => a.spend > 0 && a.leads === 0).reduce((s, a) => s + a.spend, 0);
  const best          = [...ads].sort((a, b) => b.score - a.score)[0];
  const highCtrBadCpl = [...ads].filter(a => a.quadrant === "TESTAR").sort((a, b) => b.spend - a.spend)[0];

  const insights = [];
  if (best) insights.push(`O criativo <b>${creativeName(best)}</b> lidera o período com Score Tess™ de <b>${best.score}/100</b>.`);
  if (eliteAds.length) insights.push(`Criativos ELITE geraram <b>${pct.format(totalLeads ? eliteLeads / totalLeads * 100 : 0)}%</b> dos leads usando <b>${pct.format(totalSpend ? eliteSpend / totalSpend * 100 : 0)}%</b> da verba.`);
  if (waste > 0) insights.push(`Foram investidos <b>${brl.format(waste)}</b> em criativos sem leads no período filtrado.`);
  if (highCtrBadCpl) insights.push(`<b>${creativeName(highCtrBadCpl)}</b> chama atenção, mas precisa revisão: CTR bom com CPL acima da média.`);
  if (!insights.length) insights.push("Ainda não há volume suficiente para uma análise confiável neste filtro.");

  document.querySelector("#insights").innerHTML = insights.map(i => `<div class="insight">${i}</div>`).join("");
}

function renderRanking(ads) {
  const totalLeads = ads.reduce((s, a) => s + a.leads, 0);
  document.querySelector("#rankingBody").innerHTML = ads
    .sort((a, b) => b.score - a.score || b.leads - a.leads)
    .slice(0, 40)
    .map(a => `
      <tr>
        <td><span class="score-pill">${a.score}</span></td>
        <td><span class="badge ${badgeClass(a.className)}">${a.className}</span></td>
        <td>${creativeName(a)}</td>
        <td>${brl.format(a.spend)}</td>
        <td>${num.format(a.leads)}</td>
        <td>${a.leads ? brl.format(a.cpl) : "—"}</td>
        <td>${pct.format(a.ctr)}%</td>
        <td>${pct.format(totalLeads ? a.leads / totalLeads * 100 : 0)}%</td>
      </tr>`).join("");
}

function renderCreatives(ads) {
  const eligibleCreatives = ads
    .filter(a => a.thumb || a.spend > 0 || a.leads > 0)
    .sort((a, b) => b.score - a.score);

  const loadMore = document.querySelector("#loadMoreCreatives");
  if (loadMore) loadMore.style.display = eligibleCreatives.length > renderedCreativeLimit ? "block" : "none";

  document.querySelector("#creativeGrid").innerHTML = eligibleCreatives
    .slice(0, renderedCreativeLimit)
    .map(a => `
      <article class="creative-card">
        ${cardImage(a)}
        <div class="creative-body">
          <span class="badge ${badgeClass(a.className)}">${a.className} · ${a.quadrant}</span>
          <h3>${creativeName(a)}</h3>
          <p>${a.campaign}</p>
          <div class="mini-metrics">
            <div class="mini"><small>Score</small><b>${a.score}/100</b></div>
            <div class="mini"><small>Gasto</small><b>${brl.format(a.spend)}</b></div>
            <div class="mini"><small>Leads</small><b>${num.format(a.leads)}</b></div>
            <div class="mini"><small>CPL</small><b>${a.leads ? brl.format(a.cpl) : "—"}</b></div>
            <div class="mini"><small>CTR</small><b>${pct.format(a.ctr)}%</b></div>
            <div class="mini"><small>CPC</small><b>${a.clicks ? brl.format(a.cpc) : "—"}</b></div>
          </div>
          ${a.isVideo && a.ret15 > 0 ? `
          <div class="mini-retention">
            <small>Retenção de vídeo</small>
            <div class="ret-mini-bars">
              <div class="ret-mini-item"><span>25%</span><div class="ret-mini-fill" style="width:${Math.min(a.retRate25,100)}%"></div><b>${pct.format(a.retRate25)}%</b></div>
              <div class="ret-mini-item"><span>50%</span><div class="ret-mini-fill" style="width:${Math.min(a.retRate50,100)}%"></div><b>${pct.format(a.retRate50)}%</b></div>
              <div class="ret-mini-item"><span>75%</span><div class="ret-mini-fill" style="width:${Math.min(a.retRate75,100)}%"></div><b>${pct.format(a.retRate75)}%</b></div>
            </div>
          </div>` : ""}
          <div class="recommendation"><b>Recomendação:</b> ${recommendation(a)}</div>
          ${a.post ? `<a class="open-link" href="${a.post}" target="_blank" rel="noopener">Abrir no Instagram</a>` : ""}
        </div>
      </article>`).join("");
}

function getUrlFilters() {
  const params = new URLSearchParams(window.location.search);
  return { start: params.get("start") || "", end: params.get("end") || "", campaign: params.get("campaign") || "", adset: params.get("adset") || "" };
}

function applyUrlFilters() {
  const f = getUrlFilters();
  if (f.start)    document.querySelector("#startDate").value      = f.start;
  if (f.end)      document.querySelector("#endDate").value        = f.end;
  if (f.campaign) document.querySelector("#campaignFilter").value = f.campaign;
  if (f.adset)    document.querySelector("#adsetFilter").value    = f.adset;
}

function buildFilteredUrl() {
  const url = new URL(window.location.href);
  ["start", "end", "campaign", "adset"].forEach(k => url.searchParams.delete(k));
  const start    = document.querySelector("#startDate").value;
  const end      = document.querySelector("#endDate").value;
  const campaign = document.querySelector("#campaignFilter").value;
  const adset    = document.querySelector("#adsetFilter").value;
  if (start)    url.searchParams.set("start",    start);
  if (end)      url.searchParams.set("end",      end);
  if (campaign) url.searchParams.set("campaign", campaign);
  if (adset)    url.searchParams.set("adset",    adset);
  return url.toString();
}

function syncUrlWithFilters() {
  window.history.replaceState({}, "", buildFilteredUrl());
}

function showToast(message) {
  let toast = document.querySelector("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

async function copyFilteredLink() {
  const link = buildFilteredUrl();
  try {
    await navigator.clipboard.writeText(link);
    showToast("Link filtrado copiado");
  } catch (err) {
    prompt("Copie o link filtrado:", link);
  }
}

function populateFilters() {
  const campaigns = [...new Set(rawRows.map(r => r.campaign).filter(Boolean))].sort();
  const adsets    = [...new Set(rawRows.map(r => r.adset).filter(Boolean))].sort();
  document.querySelector("#campaignFilter").innerHTML = `<option value="">Todas</option>` + campaigns.map(c => `<option>${c}</option>`).join("");
  document.querySelector("#adsetFilter").innerHTML    = `<option value="">Todos</option>`  + adsets.map(c    => `<option>${c}</option>`).join("");

  const dates = rawRows.map(r => d(r.date)).filter(Boolean).sort((a, b) => a - b);
  if (dates.length) {
    document.querySelector("#startDate").value = dates[0].toISOString().slice(0, 10);
    document.querySelector("#endDate").value   = dates[dates.length - 1].toISOString().slice(0, 10);
  }
  applyUrlFilters();
}

// Públicos: agrega direto sobre rows brutas — leads no adset correto
function aggregateByPublic(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.adset || "Sem público";
    if (!map.has(key)) {
      map.set(key, { name: key, spend: 0, leads: 0, impressions: 0, clicks: 0, adNames: new Set() });
    }
    const item = map.get(key);
    item.spend       += r.spend;
    item.leads       += r.leads;
    item.impressions += r.impressions;
    item.clicks      += r.clicks;
    item.adNames.add(r.ad);
  }

  const publics    = [...map.values()];
  const totalLeads = publics.reduce((s, p) => s + p.leads, 0);
  const totalSpend = publics.reduce((s, p) => s + p.spend, 0);
  const avgCpl     = totalLeads ? totalSpend / totalLeads : 0;
  const avgCtrVal  = (() => {
    const valid = publics.filter(p => p.impressions > 0).map(p => (p.clicks / p.impressions) * 100);
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  })();

  return publics.map(p => {
    const cpl        = p.leads       ? p.spend / p.leads                : 0;
    const ctr        = p.impressions ? (p.clicks / p.impressions) * 100 : 0;
    const leadShare  = totalLeads    ? (p.leads / totalLeads) * 100     : 0;
    const spendShare = totalSpend    ? (p.spend / totalSpend) * 100     : 0;
    const creatives  = p.adNames.size;
    let action = "REVISAR";
    if (p.leads > 0 && cpl <= avgCpl && ctr >= avgCtrVal) action = "ESCALAR";
    else if (p.leads > 0 && cpl <= avgCpl)                action = "MANTER";
    else if (p.spend > 0 && p.leads === 0)                action = "PAUSAR";
    return { ...p, cpl, ctr, leadShare, spendShare, creatives, action };
  });
}

function resolveBestCreatives(publics, ads) {
  return publics.map(p => {
    const adsInPublic = ads.filter(a => p.adNames && p.adNames.has(a.name));
    const best = adsInPublic.sort((a, b) => b.score - a.score)[0] || null;
    return { ...p, bestCreative: best };
  });
}

function publicActionClass(action) {
  if (action === "ESCALAR") return "escalar";
  if (action === "MANTER")  return "manter";
  if (action === "PAUSAR")  return "pausar";
  return "revisar";
}

function publicActionText(p) {
  if (p.action === "ESCALAR") return `Público forte: gera leads com eficiência acima da média. <b>Prioridade para escalar</b> com novos criativos.`;
  if (p.action === "MANTER")  return `Público saudável: CPL competitivo, mas ainda pode melhorar em CTR ou volume. <b>Manter e testar variações</b>.`;
  if (p.action === "PAUSAR")  return `Público consumiu verba sem gerar leads no período filtrado. <b>Revisar segmentação ou pausar</b>.`;
  return `Público com eficiência abaixo da média. <b>Revisar criativos, promessa ou segmentação</b> antes de aumentar verba.`;
}

function renderPublics(rows, ads) {
 

  const rawPublics = aggregateByPublic(rows)
    .filter(p => p.spend > 0 || p.leads > 0 || p.impressions > 0)
    .sort((a, b) => b.leads - a.leads || a.cpl - b.cpl);

  const publics = resolveBestCreatives(rawPublics, ads);
  const overview = document.querySelector("#publicOverview");
  const grid     = document.querySelector("#publicAnalysis");
  if (!overview || !grid) return;

  if (!publics.length) {
    overview.innerHTML = "";
    grid.innerHTML = `<div class="public-card"><h3>Sem dados de público</h3><p class="public-note">Não há dados suficientes no filtro atual.</p></div>`;
    return;
  }

  const used = new Set();
  const pickUniquePublic = (list) => { const item = list.find(p => !used.has(p.name)); if (item) used.add(item.name); return item; };
  const withLeads        = publics.filter(p => p.leads > 0);
  const withImpressions  = publics.filter(p => p.impressions > 100);

  const bestVolume        = pickUniquePublic([...withLeads].sort((a, b) => b.leads - a.leads));
  const bestCpl           = pickUniquePublic([...withLeads].sort((a, b) => a.cpl - b.cpl));
  const bestCtr           = pickUniquePublic([...withImpressions].sort((a, b) => b.ctr - a.ctr));
  const biggestDependency = pickUniquePublic([...withLeads].sort((a, b) => b.leadShare - a.leadShare));

  const overviewItems = [
    ["Mais leads",  bestVolume,        p => `${num.format(p.leads)} leads`, "Maior volume de leads no período."],
    ["Menor CPL",   bestCpl,           p => `${brl.format(p.cpl)}`,         "Público mais eficiente em custo."],
    ["Maior CTR",   bestCtr,           p => `${pct.format(p.ctr)}%`,        "Maior capacidade de gerar clique."],
    ["Dependência", biggestDependency, p => `${pct.format(p.leadShare)}%`,  "Participação nos leads totais."]
  ].filter(item => item[1]);

  overview.innerHTML = overviewItems.map(([label, p, valueFn, desc]) => `
    <article class="public-kpi">
      <span>${label}</span>
      <strong>${p.name}</strong>
      <small>${valueFn(p)} · ${desc}</small>
    </article>`).join("");

  grid.innerHTML = publics.slice(0, 12).map(p => `
    <article class="public-card">
      <span class="public-badge ${publicActionClass(p.action)}">${p.action}</span>
      <h3>${p.name}</h3>
      <div class="public-metrics">
        <div class="public-metric"><small>Investimento</small><b>${brl.format(p.spend)}</b></div>
        <div class="public-metric"><small>Leads</small><b>${num.format(p.leads)}</b></div>
        <div class="public-metric"><small>CPL</small><b>${p.leads ? brl.format(p.cpl) : "—"}</b></div>
        <div class="public-metric"><small>CTR</small><b>${pct.format(p.ctr)}%</b></div>
        <div class="public-metric"><small>% dos leads</small><b>${pct.format(p.leadShare)}%</b></div>
        <div class="public-metric"><small>Criativos</small><b>${num.format(p.creatives)}</b></div>
      </div>
      <p class="public-note">${publicActionText(p)}</p>
      <p class="public-best">Melhor criativo: ${p.bestCreative ? creativeName(p.bestCreative) : "—"}</p>
    </article>`).join("");
}

function render() {
  const rows = currentRows();
  const ads  = scoreAds(aggregateByAd(rows));

  renderKpis(rows, ads);
  renderTrend(rows);
  renderPublics(rows, ads);
  renderHall(ads);
  renderQuadrantBoard(ads);
  renderActionBoard(ads);
  renderInsights(ads);
  renderRanking(ads);
  renderCreatives(ads);
  renderVideoRetention(ads);

  const start = document.querySelector("#startDate").value;
  const end   = document.querySelector("#endDate").value;
  document.querySelector("#status").textContent      = `${ads.length} criativos analisados`;
  document.querySelector("#periodLabel").textContent = `${start || "início"} até ${end || "fim"} · ${rows.length} registros`;
}

function setLoadedState() {
  document.body.classList.add("loaded");
}

function saveLocalCache(data) {
  try { localStorage.setItem("tess_ci_rows_v33", JSON.stringify({ savedAt: new Date().toISOString(), data })); }
  catch (err) { console.warn("Não foi possível salvar cache local", err); }
}

function readLocalCache() {
  try { const raw = localStorage.getItem("tess_ci_rows_v33"); return raw ? JSON.parse(raw) : null; }
  catch (err) { return null; }
}

function renderFromData(data, source = "fresh") {
  rawRows = data.map(normalize);
  renderedCreativeLimit = window.innerWidth < 680 ? 8 : 16;
  populateFilters();
  render();
  setLoadedState();
  if (source === "cache") {
    const label = document.querySelector("#periodLabel");
    label.innerHTML = label.textContent + `<div class="cached-note">Mostrando cache local enquanto atualizo a planilha.</div>`;
  }
}

async function fetchFreshData({ silent = false } = {}) {
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 22000);
  try {
    if (!silent) document.querySelector("#status").textContent = "Conectando à planilha...";
    const res = await fetch(API_URL + "?v=" + Date.now(), { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!silent) document.querySelector("#status").textContent = "Processando dados...";
    const data = await res.json();
    saveLocalCache(data);
    renderFromData(data, "fresh");
    return data;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function clearOldDashboardCaches() {
  try { ["tess_ci_rows_v25","tess_ci_rows_v30","tess_ci_rows_v31","tess_ci_rows_v32"].forEach(k => localStorage.removeItem(k)); }
  catch (err) { console.warn("Não foi possível limpar caches antigos", err); }
}

async function init() {
  clearOldDashboardCaches();
  const cached = readLocalCache();

  if (cached?.data?.length) {
    document.querySelector("#status").textContent = "Carregando cache local...";
    renderFromData(cached.data, "cache");
    fetchFreshData({ silent: true }).catch(err => {
      console.warn("Falha ao atualizar dados em segundo plano", err);
      document.querySelector("#status").textContent = `${rawRows.length ? "Dados carregados" : "Erro ao atualizar"}`;
    });
    return;
  }

  try {
    await fetchFreshData();
  } catch (err) {
    console.error(err);
    setLoadedState();
    document.querySelector("#status").textContent      = "Erro ao carregar API";
    document.querySelector("#periodLabel").textContent = "A primeira carga depende do Google Apps Script. Tente recarregar ou confira a URL /exec.";
    document.querySelector("#kpis").innerHTML = `<article class="kpi"><span>Erro</span><strong>API indisponível</strong></article>`;
  }
}

document.addEventListener("change", e => {
  if (e.target.matches("#startDate,#endDate,#campaignFilter,#adsetFilter")) {
    renderedCreativeLimit = window.innerWidth < 680 ? 8 : 16;
    syncUrlWithFilters();
    render();
  }
});

document.querySelector("#clearFilters").addEventListener("click", () => {
  renderedCreativeLimit = window.innerWidth < 680 ? 8 : 16;
  const url = new URL(window.location.href);
  url.search = "";
  window.history.replaceState({}, "", url.toString());
  populateFilters();
  render();
});

const loadMoreButton = document.querySelector("#loadMoreCreatives");
if (loadMoreButton) {
  loadMoreButton.addEventListener("click", () => {
    renderedCreativeLimit += window.innerWidth < 680 ? 8 : 16;
    render();
  });
}

const copyFilterButton = document.querySelector("#copyFilterLink");
if (copyFilterButton) copyFilterButton.addEventListener("click", copyFilteredLink);

const forceRefreshButton = document.querySelector("#forceRefreshData");
if (forceRefreshButton) {
  forceRefreshButton.addEventListener("click", async () => {
    try {
      localStorage.removeItem("tess_ci_rows_v33");
      document.querySelector("#status").textContent = "Atualizando dados...";
      await fetchFreshData({ silent: false });
      showToast("Dados atualizados");
    } catch (err) {
      console.error(err);
      showToast("Erro ao atualizar dados");
    }
  });
}

init();

// Sobrescreve renderVideoRetention com versão visual — cards + minigráfico SVG
function renderVideoRetention(ads) {
  const el = document.querySelector("#videoRetention");
  if (!el) return;

  const videoAds = ads
    .filter(a => a.isVideo && (a.ret15 > 0 || a.view25 > 0))
    .sort((a, b) => b.leads - a.leads || b.view25 - a.view25);

  if (!videoAds.length) {
    el.innerHTML = `<p class="muted" style="padding:16px">Nenhum dado de retenção de vídeo disponível no período filtrado.</p>`;
    return;
  }

  el.innerHTML = videoAds.map(a => {
    const base = a.ret15 > 0 ? a.ret15 : a.view25;
    const points = [
      { label: "25%",  value: a.retRate25 },
      { label: "50%",  value: a.retRate50 },
      { label: "75%",  value: a.retRate75 },
      { label: "95%",  value: a.retRate95 }
    ];

    // SVG sparkline
    const W = 200, H = 56, pad = 8;
    const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - pad * 2));
    const ys = points.map(p => H - pad - (Math.min(p.value, 100) / 100) * (H - pad * 2));
    const pathD = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
    const areaD = pathD + ` L${xs[xs.length-1].toFixed(1)},${(H-pad).toFixed(1)} L${xs[0].toFixed(1)},${(H-pad).toFixed(1)} Z`;

    const dots = xs.map((x, i) => `<circle cx="${x.toFixed(1)}" cy="${ys[i].toFixed(1)}" r="3" fill="var(--blue)"/>`).join("");
    const labels = xs.map((x, i) => `<text x="${x.toFixed(1)}" y="${H}" text-anchor="middle" font-size="9" fill="rgba(157,177,186,.7)">${points[i].label}</text>`).join("");
    const values = xs.map((x, i) => `<text x="${x.toFixed(1)}" y="${(ys[i]-6).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--blue)">${pct.format(points[i].value)}%</text>`).join("");

    const svgChart = `
      <svg viewBox="0 0 ${W} ${H+10}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;overflow:visible">
        <defs>
          <linearGradient id="rg${a.name.replace(/\W/g,'')}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(112,216,255,.28)"/>
            <stop offset="100%" stop-color="rgba(112,216,255,0)"/>
          </linearGradient>
        </defs>
        <path d="${areaD}" fill="url(#rg${a.name.replace(/\W/g,'')})" />
        <path d="${pathD}" fill="none" stroke="var(--blue)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
        ${values}
        ${labels}
      </svg>`;

    return `
      <article class="ret-card">
        ${a.thumb ? `<img src="${a.thumb}" alt="${a.name}" loading="lazy" onerror="this.style.display='none'">` : ""}
        <div class="ret-body">
          <div class="ret-top">
            <div>
              <h3>${creativeName(a)}</h3>
              <small>${a.adset}</small>
            </div>
            <div class="ret-kpi-row">
              <span class="ret-kpi-pill"><b>${num.format(base)}</b><small>${a.ret15 > 0 ? "15s" : "25%"}</small></span>
              <span class="ret-kpi-pill"><b>${num.format(a.leads)}</b><small>leads</small></span>
            </div>
          </div>
          <div class="ret-chart">${svgChart}</div>
          <p class="ret-note">${retentionInsight(a)}</p>
        </div>
      </article>`;
  }).join("");
}
