// GET /api/yahoo?t=SPCX            -> datos completos de un ticker
// GET /api/yahoo?peers=AAPL,MSFT   -> datos ligeros de varios tickers
import yahooFinance from "yahoo-finance2";
yahooFinance.suppressNotices?.(["yahooSurvey"]);

const J = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "public, max-age=1800" },
  });
const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const MODS = ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "summaryProfile"];

function flat(t, q) {
  const p = q.price || {}, sd = q.summaryDetail || {}, ks = q.defaultKeyStatistics || {};
  const fd = q.financialData || {}, pr = q.summaryProfile || {};
  return {
    t, name: p.longName || p.shortName || t, cur: p.currency || "",
    mc: num(p.marketCap) ?? num(sd.marketCap), px: num(p.regularMarketPrice),
    pe: num(sd.trailingPE), fpe: num(sd.forwardPE) ?? num(ks.forwardPE),
    beta: num(sd.beta) ?? num(ks.beta), divRate: num(sd.dividendRate),
    ev: num(ks.enterpriseToEbitda), ps: num(sd.priceToSalesTrailing12Months),
    roe: num(fd.returnOnEquity), mo: num(fd.operatingMargins), rg: num(fd.revenueGrowth),
    eg: num(fd.earningsGrowth), de: num(fd.debtToEquity), cr: num(fd.currentRatio),
    sector: pr.sector || "", industry: pr.industry || "", country: pr.country || "",
    summary: (pr.longBusinessSummary || "").slice(0, 1200),
  };
}

const light = async (t) => {
  try {
    return flat(t, await yahooFinance.quoteSummary(t, { modules: MODS }, { validateResult: false }));
  } catch { return null; }
};

export default async (req) => {
  const u = new URL(req.url);
  const t = (u.searchParams.get("t") || "").trim().toUpperCase();
  const peers = (u.searchParams.get("peers") || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 20);
  try {
    if (peers.length) return J({ peers: (await Promise.all(peers.map(light))).filter(Boolean) });
    if (!t) return J({ error: "Falta el ticker" }, 400);
    const [q, ch, fin] = await Promise.all([
      yahooFinance.quoteSummary(t, { modules: MODS }, { validateResult: false }),
      yahooFinance.chart(t, { period1: new Date(Date.now() - 10 * 365 * 864e5), interval: "1d" }, { validateResult: false }),
      yahooFinance.fundamentalsTimeSeries(t, { period1: "2018-01-01", type: "annual", module: "all" }, { validateResult: false }).catch(() => []),
    ]);
    const qs = (ch.quotes || []).filter((x) => num(x.adjclose ?? x.close) !== null);
    return J({
      info: flat(t, q),
      t: qs.map((x) => Math.floor(new Date(x.date).getTime() / 1000)),
      c: qs.map((x) => Math.round((x.adjclose ?? x.close) * 100) / 100),
      fin: (fin || []).map((x) => ({
        y: new Date(x.date).getFullYear(), dt: Math.floor(new Date(x.date).getTime() / 1000),
        rev: num(x.totalRevenue), ni: num(x.netIncome), gp: num(x.grossProfit), op: num(x.operatingIncome),
        fcf: num(x.freeCashFlow), sh: num(x.dilutedAverageShares) ?? num(x.basicAverageShares),
      })).sort((a, b) => a.dt - b.dt).slice(-6),
    });
  } catch (e) {
    return J({ error: `No pude traer "${t || peers.join(",")}" de Yahoo: ${String(e.message || e).slice(0, 120)}` }, 502);
  }
};
export const config = { path: "/api/yahoo" };
