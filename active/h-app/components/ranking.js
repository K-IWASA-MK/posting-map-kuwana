// POSTING MAP Component: ranking.js (Stateless, API-free rendering)
window.renderRankingCard = function(rankingData, myStaffId) {
  if (!rankingData || !Array.isArray(rankingData)) return '';

  let myRank = -1;
  let myCount = 0;

  // Backend提供の集計サマリまたは isMe フラグを優先（staffIdによるクライアント側突合を廃止）
  if (typeof window !== 'undefined' && window._myRankingSummary) {
    myRank = window._myRankingSummary.rank || -1;
    myCount = window._myRankingSummary.count || 0;
  } else {
    const meItem = rankingData.find(r => r.isMe === true) || (myStaffId ? rankingData.find(r => r.staffId === myStaffId) : null);
    if (meItem) {
      const idx = rankingData.indexOf(meItem);
      myRank = meItem.rank || (idx + 1);
      myCount = meItem.count || 0;
    }
  }

  const escapeStr = (str) => (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // 1位の人物 (Hero)
  const firstItem = rankingData.length > 0 ? rankingData[0] : null;
  const heroHtml = firstItem ? `
    <div class="ranking-hero mb-6">
      <span class="ranking-hero-badge">TOP PERFORMER · 1ST PLACE</span>
      <span class="ranking-hero-name">${escapeStr(firstItem.staffName || firstItem.staffId || '')}</span>
      <div class="ranking-hero-score">${(firstItem.count || 0).toLocaleString()}<span style="font-size: 1rem; color: rgba(255,255,255,0.7); margin-left: 4px;">枚</span></div>
    </div>
  ` : '';

  const rowsHtml = rankingData.map((item, index) => {
    const rank = item.rank || (index + 1);
    const isMe = item.isMe === true || (myStaffId && item.staffId === myStaffId);
    const meBg = isMe ? 'style="border-color: rgba(0, 183, 255, 0.45); background: rgba(0, 183, 255, 0.08); box-shadow: 0 0 15px rgba(0,183,255,0.06);"' : '';
    const nameColor = isMe ? 'text-[#00B7FF]' : 'text-white/90';

    return `
      <div ${meBg} class="ranking-row">
        <div class="ranking-pos">${rank}</div>
        <div class="ranking-user">
          <span class="ranking-uname ${nameColor}">${escapeStr(item.staffName || item.staffId || '')}</span>
          <span class="ranking-uid">${escapeStr(item.staffId || '')}</span>
        </div>
        <span class="ranking-count">${(item.count || 0).toLocaleString()}枚</span>
      </div>
    `;
  }).join('');

  const myRankSummaryHtml = myRank !== -1 ? `
    <div style="border: 1px solid #EA5F08; box-shadow: 0 0 6px rgba(234,95,8,.35), 0 0 12px rgba(234,95,8,.18); background: linear-gradient(180deg, rgba(234,95,8,0.12), rgba(234,95,8,0.04));" class="premium-glass py-5 px-6 flex justify-around items-center rounded-2xl mb-6">
      <div class="text-center">
        <span class="text-[9px] font-bold text-white/40 tracking-wider block">現在の順位</span>
        <span class="text-2xl font-black text-white font-mono">${myRank}位</span>
      </div>
      <div class="w-[1px] h-8 bg-white/10"></div>
      <div class="text-center">
        <span class="text-[9px] font-bold text-white/40 tracking-wider block">配布実績枚数</span>
        <span class="text-2xl font-black text-white font-mono">${myCount.toLocaleString()}枚</span>
      </div>
    </div>
  ` : '';

  return `
    <div class="space-y-4">
      ${heroHtml}
      ${myRankSummaryHtml}
      <div class="space-y-2">
        <div class="text-[10px] font-black text-white/30 tracking-widest uppercase mb-1">ランキング一覧</div>
        <div class="flex flex-col gap-2">
          ${rowsHtml}
        </div>
      </div>
    </div>
  `;
};
