// POSTING MAP Component: staff.js (Stateless, API-free rendering)
window.renderStaffCard = function(userInfo, options = {}) {
  if (!userInfo) return '';

  const avatarHtml = userInfo.picture ? `
    <div class="w-20 h-20 rounded-full overflow-hidden border-2 border-white/20 shadow-xl mb-3">
      <img src="${userInfo.picture}" class="w-full h-full object-cover">
    </div>
  ` : '';

  const staffIdText = userInfo.id || '---';
  const fullName = `${userInfo.last || ''} ${userInfo.first || ''}`.trim() || '公式配布員';
  const displayBranch = options.districtName || options.branchName || '';

  return `
    <div class="pt-2 pb-0 px-2 flex flex-col items-center w-full">
      <div class="solid-card-id">
        <!-- 1. オレンジバッジ -->
        <span class="staff-id-badge">STAFF IDENTITY</span>

        <!-- 2. STAFF ID 番号 -->
        <div class="staff-id-number">${escapeHtml(staffIdText)}</div>

        <!-- 3. アバター (存在する場合のみ) -->
        ${avatarHtml}

        <!-- 4. 氏名 -->
        <div class="staff-id-name">${escapeHtml(fullName)}</div>

        <!-- 5. 説明文プローズブロック (中央配置 ＆ 本文左揃え) -->
        <div class="staff-prose">
          <p>
            ポスティングを自由に楽しもう<br>
            空いてる時間に近い場所から
          </p>
          <p>
            マップを見ながら街を歩いて<br>
            自分のペースで自分らしく<br>
            気軽に参加しましょう
          </p>
          <p>
            ポスティングが終わったら<br>
            配った枚数を入力してね！
          </p>
          <p>
            ランキングもあります<br>
            ぜひチェックしてみてね！
          </p>
        </div>

        <!-- 6. 最下部 メタ情報 & 規約リンク -->
        <div class="mt-6 flex flex-col items-center gap-2 w-full">
          ${displayBranch ? `<p class="text-[9px] font-black text-white/40 uppercase tracking-[0.25em]">${escapeHtml(displayBranch)}</p>` : ''}
          <div class="flex items-center justify-center gap-4 text-[9px] font-black text-white/40 uppercase tracking-[0.25em] select-none">
            <span class="cursor-pointer hover:text-white transition-colors" onclick="openIdInfoModal('terms', event)">Terms</span>
            <span>·</span>
            <span class="cursor-pointer hover:text-white transition-colors" onclick="openIdInfoModal('privacy', event)">Privacy</span>
            <span>·</span>
            <span class="cursor-pointer hover:text-white transition-colors" onclick="openIdInfoModal('license', event)">License</span>
          </div>
        </div>
      </div>
    </div>
  `;
};
