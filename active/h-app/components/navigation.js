// POSTING MAP Component: navigation.js (Stateless, API-free rendering)
window.renderBottomNavigation = function(activePage) {
  const isAreas = activePage === 'areas';
  const isRanking = activePage === 'ranking';
  const isStorage = activePage === 'storage-list';

  return `
    <div class="floating-tabbar-capsule">
      <button id="tab-areas" class="tab-item ${isAreas ? 'active' : ''}" onclick="navigateToAreaTab()">
        <svg class="tab-icon" viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>
        <span class="tab-label">エリア</span>
      </button>
      <button id="tab-ranking" class="tab-item ${isRanking ? 'active' : ''}" onclick="switchPage('ranking')">
        <svg class="tab-icon" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.45 1-1 1H7c-.55 0-1-.45-1-1v-2.34"></path><path d="M14 14.66V17c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-2.34"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
        <span class="tab-label">ランキング</span>
      </button>
      <button id="tab-storage" class="tab-item ${isStorage ? 'active' : ''}" onclick="switchPage('storage-list')">
        <svg class="tab-icon" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
        <span class="tab-label">在庫</span>
      </button>
      <button id="tab-more" class="tab-item" onclick="openMoreSheet()">
        <svg class="tab-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>
        <span class="tab-label">その他</span>
      </button>
    </div>
  `;
};

window.openMoreSheet = function() {
  const backdrop = document.getElementById('more-sheet-backdrop');
  const panel = document.getElementById('more-sheet-panel');
  if (backdrop && panel) {
    backdrop.classList.add('active');
    panel.classList.add('active');
  }
};

window.closeMoreSheet = function() {
  const backdrop = document.getElementById('more-sheet-backdrop');
  const panel = document.getElementById('more-sheet-panel');
  if (backdrop && panel) {
    backdrop.classList.remove('active');
    panel.classList.remove('active');
  }
};

window.handleMoreMenuClick = async function(pageId) {
  window.closeMoreSheet();
  const switchFn = window.switchPage || (typeof switchPage === 'function' ? switchPage : null);
  if (switchFn) {
    await switchFn(pageId);
    const moreTab = document.getElementById('tab-more');
    if (moreTab) {
      moreTab.classList.add('active');
    }
  }
};
