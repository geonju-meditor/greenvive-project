// 국가해양생태계종합조사 어류 API → species.json (지점 × 계절별 많이 확인된 어종)
// 사용: DATA_GO_KR_KEY=<디코딩 인증키> OPERATION=<오퍼레이션 이름> node scripts/build-species.js
// 키는 환경 변수로만 받고 파일·화면에 남기지 않는다. (Node 18 이상)
const fs = require("fs");
const BASE = "https://apis.data.go.kr/1192000/MarEcosysRschFishInfoService";
const ROWS = 1000, TOP = 8;

// <item>...</item> 목록을 { 태그: 값 } 객체로 바꾼다.
function parseItems(xml) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const o = {};
    for (const t of m[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)) o[t[1]] = t[2].trim();
    items.push(o);
  }
  return items;
}

// 지점(exmnIemPtclNm) × 계절(exmnIemNm)별로 한글 이름(localNm)의 개체수(enttCnt)를 합쳐 상위 TOP개만 남긴다.
function aggregate(items) {
  const sites = {}, years = new Set();
  for (const it of items) {
    if (!it.localNm || !it.exmnIemPtclNm || !it.exmnIemNm) continue;
    if (it.exmnBizSeCd && it.exmnBizSeCd !== "어류") continue;
    years.add(it.exmnYr);
    const season = ((sites[it.exmnIemPtclNm] ||= {})[it.exmnIemNm] ||= {});
    const f = (season[it.localNm] ||= { name: it.localNm, count: 0, tag: it.dsrbCn || "" });
    f.count += Number(it.enttCnt) || 0;
  }
  for (const site of Object.values(sites))
    for (const s of Object.keys(site))
      site[s] = Object.values(site[s]).sort((a, b) => b.count - a.count).slice(0, TOP);
  return { years: [...years].sort(), sites };
}

async function main() {
  const key = process.env.DATA_GO_KR_KEY, op = process.env.OPERATION;
  if (!key || !op) { console.error("DATA_GO_KR_KEY 와 OPERATION 환경 변수가 필요해요."); process.exit(1); }
  const all = [];
  for (let page = 1; ; page++) {
    const url = BASE + "/" + op + "?serviceKey=" + encodeURIComponent(key) + "&pageNo=" + page + "&numOfRows=" + ROWS;
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status + " (page " + page + ")");
    const xml = await res.text();
    const code = (xml.match(/<resultCode>(\d+)<\/resultCode>/) || [])[1];
    if (code && code !== "00") throw new Error("API 오류 코드 " + code + ": " + (xml.match(/<resultMsg>([^<]*)/) || [])[1]);
    const items = parseItems(xml);
    all.push(...items);
    process.stdout.write("\r받은 기록 " + all.length + "개");
    if (items.length < ROWS) break;
  }
  console.log();
  const out = aggregate(all);
  fs.writeFileSync("species.json", JSON.stringify(out, null, 1));
  console.log("species.json 저장 완료 / 조사 지점:", Object.keys(out.sites).join(", "));
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { parseItems, aggregate };
