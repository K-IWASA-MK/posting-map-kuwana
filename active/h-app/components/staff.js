// POSTING MAP Component: staff.js (Stateless, API-free rendering)
window.renderStaffCard = function(userInfo, options = {}) {
  if (!userInfo) return '';

  const avatarHtml = userInfo.picture ? `
    <div class="w-24 h-24 rounded-full overflow-hidden border-2 border-white/20 shadow-2xl mb-4 relative z-10">
      <img src="${userInfo.picture}" class="w-full h-full object-cover">
    </div>
  ` : `
    <div class="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4 relative z-10">
      <span class="text-3xl text-white/40">👤</span>
    </div>
  `;

  const formattedId = userInfo.id ? userInfo.id.replace(/^[A-Za-z]+/, 'STAFF ID ') : '';
  const displayBranch = options.districtName || options.branchName || '';
  const lastSyncTime = options.lastSyncTime || '--:--';
  const registrationDate = userInfo.registrationDate || '2025/07/01';

  return `
    <div class="pt-2 pb-0 px-4 flex flex-col items-center">
      <div class="mb-6 flex items-center justify-center gap-3">
        <span class="text-xs font-bold text-white/50 tracking-wider">公式配布員</span>
        ${formattedId ? `<span style="letter-spacing: 0.15em; text-indent: 0.15em; background: linear-gradient(180deg, rgba(234,95,8,0.16), rgba(234,95,8,0.06)); border: 1px solid #EA5F08; box-shadow: 0 0 6px rgba(234,95,8,.35), 0 0 12px rgba(234,95,8,.18); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);" class="inline-flex items-center justify-center h-6 px-3 text-[10px] font-black text-white font-mono rounded-full">${formattedId}</span>` : ''}
      </div>
      
      <div id="id-gyro-card" style="height: 300px; --glow-x: 0px; --glow-y: 0px; --glow-opacity: 0.08; --edge-opacity: 0.08; --edge-angle: 180deg;" class="w-full max-w-sm gyro-card flex flex-col items-center p-6 relative overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-b from-white/5 to-white/0 pointer-events-none rounded-[28px]"></div>
        
        <!-- 1. 最上部 (🟢AUTHを本当に少しだけ下へ微調整) -->
        <div style="margin-top: 18px;" class="inline-flex items-center gap-2 z-10">
          <span class="w-2 h-2 bg-[#22c55e] rounded-full shadow-[0_0_8px_#22c55e]"></span>
          <span class="text-[8px] font-black text-[#22c55e] uppercase tracking-[0.3em]">Authorized Staff</span>
        </div>
        
        <!-- 2. 中央アバターと名前 (絶対配置で縦横完全センター化、元のサイズをキープ) -->
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);" class="flex flex-col items-center z-10 w-full max-w-[280px]">
          ${avatarHtml}
          <div style="font-size: 28px; font-weight: 900; color: #ffffff; text-align: center; letter-spacing: 0.05em; line-height: 1.1;" class="flex flex-col items-center w-full">
            <div class="truncate w-full">${escapeHtml(userInfo.last)}</div>
            <div class="text-xs text-white/40 font-medium mt-1 truncate w-full">${escapeHtml(userInfo.first || '')}</div>
          </div>
        </div>
        
        <!-- 3. 最下部 (底面から12px固定、上の2行をさらに1行分上にシフトしてバランス調整) -->
        <div style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); width: 100%;" class="flex flex-col items-center gap-0.5 z-10">
          ${displayBranch ? `<p class="text-[8px] font-black text-white/40 uppercase tracking-[0.3em]">${displayBranch}</p>` : ''}
          <p class="text-[8px] font-black text-white/40 uppercase tracking-[0.3em]">Field Operations</p>
          <p style="margin-top: 12px;" class="text-[8px] font-black text-white/40 uppercase tracking-[0.3em] select-none">
            <span class="cursor-pointer hover:text-white transition-colors" onclick="openIdInfoModal('terms', event)">Terms</span>
            &nbsp;&nbsp;
            <span class="cursor-pointer hover:text-white transition-colors" onclick="openIdInfoModal('privacy', event)">Privacy</span>
            &nbsp;&nbsp;
            <span class="cursor-pointer hover:text-white transition-colors" onclick="openIdInfoModal('license', event)">License</span>
          </p>
        </div>
      </div>

      <!-- 第2カード: メッセージカード -->
      <div class="w-full max-w-sm gyro-card flex flex-col items-center justify-center py-10 px-6 relative overflow-hidden text-center select-none" style="margin-top: 18px; min-height: 240px; --glow-x: 0px; --glow-y: 0px; --glow-opacity: 0.08; --edge-opacity: 0.08; --edge-angle: 180deg;">
        <div class="absolute inset-0 bg-gradient-to-b from-white/5 to-white/0 pointer-events-none rounded-[28px]"></div>
        <div class="id-ambient-sheen pointer-events-none"></div>
        <p class="id-message-card-text font-medium text-white/80 z-10 text-left w-full">
          <br>
          ポスティングを自由に楽しもう<br>
          空いてる時間に近い場所から<br><br>

          マップを見ながら街を歩いて<br>
          自分のペースで自分らしく<br>
          気軽に参加しましょう<br><br>

          ポスティングが終わったら<br>
          配った枚数を入力してね！<br><br>

          ランキングもあります<br>
          ぜひチェックしてみてね！<br>
          <br>
        </p>
      </div>
    </div>
  `;
};
