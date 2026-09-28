# POSTING MAP Universal Design System Specification

- **Version**: 2.0.0
- **Status**: ACTIVE / CANONICAL SSOT
- **Supreme Authority**: [AGENTS.md](../../AGENTS.md)
- **Master Plan**: [01_DESIGN_CONTRACT.md](01_DESIGN_CONTRACT.md)
- **Token Source of Truth**: [active/dashboard/style.css](../../active/dashboard/style.css) (`:root`)

本書は、POSTING MAP Universal Engine（H-App / Dashboard）における UI/UX 設計標準およびガバナンスの唯一の正本（Single Source of Truth）であり、デザイン変数の定義からコンポーネント責務境界までを一元規定する。

---

## 1. Design System Architecture & 責務境界

```text
Design Tokens (active/dashboard/style.css :root ※H-App)
       │
       ▼
Components (active/dashboard/components/ : JS Functions)
       │
       ▼
Pages (Composition / render.js)
```

1. **Design Tokens (`active/dashboard/style.css` `:root`)**:
   - 見た目の設計変数（色、余白、角丸、シャドウ）の正本。
   - **H-App（現場配布員UI: `active/dashboard/`）のトークン SSOT** であり、CSS カスタムプロパティとして一元管理される。
   - ※なお、**Manager Dashboard（統括管理者UI: `active/manager/index.html`）** は、現行 Runtime において Tailwind CSS CDN およびインラインの `tailwind.config` カラーパレット（`brand: '#EA5F08'`, `appBg: '#0B1019'` 等）を独自に使用しており、別個のスタイル体系を持つ（現行アーキテクチャ境界の客観的事実）。
2. **Components (`active/dashboard/components/`)**:
   - 再利用可能な UI レンダリングコンポーネント。
   - 入力データから純粋に HTML 文字列を構築して返却する。
3. **Pages (`render.js`)**:
   - 画面の合成（Composition）および状態管理（State Management）の所有者。
   - API 通信、イベントリスナー登録、タブ切り替え、各コンポーネントへのデータ配分を担当する。

---

## 2. 現場・屋外利用原則 (Outdoor Usability & Accessibility)

現場配布員が歩行中・直射日光下・手袋着用時でも安全かつ確実に操作できるよう、以下の必須要件を厳守する：

### ① Outdoor Readability (屋外視認性)
- 晴天下・直射日光下でも高いコントラスト比を維持し、主要テキストや境界線を明瞭に視認できること。
- 背景と文字のコントラスト不足や、視認不能な薄色テキスト（10px未満や過剰な透過）を禁止する。

### ② Accessible Touch Target Sizes (操作性・タップ領域)
- ボタンおよびタップ可能領域のサイズは **原則48px以上** を確保する（[01_DESIGN_CONTRACT.md](01_DESIGN_CONTRACT.md) §16 準拠）。
- 歩行中や手袋を着用した状態でも誤タップなく押下可能なサイズ・余白を設計する。

### ③ Non-Color Dependent States (色依存の排除)
- 成功、警告、エラー、進行中などの状態を「赤」や「緑」といった色情報のみに依存して表現してはならない。
- 必ずテキストラベルや明瞭なアイコンを併用し、色覚多様性および強光下での識別性を担保する。

### ④ 8px Grid Layout (グリッド整合)
- 余白（Margin / Padding）はすべて 8px グリッドシステム（4px, 8px, 16px, 24px, 32px）を基準とする。

---

## 3. Design Tokens Specification

すべてのスタイル変数は `active/dashboard/style.css` の `:root` に定義された CSS カスタムプロパティを使用する。HTML / JavaScript / CSS 内でのカラーコードや余白の生値ハードコードは禁止する。

### 🎨 Colors
| CSS Variable | Value | 用途 |
|---|---|---|
| `--color-primary` | `#f4700f` | 主要アクション、アクセントカラー、自陣営ブランドカラー |
| `--color-info` | `#00B7FF` | 情報表示、ハイライト |
| `--color-success` | `#22C55E` | 正常、完了、ONLINE インジケータ |
| `--color-warning` | `#F59E0B` | 警告、SYNCING、注意喚起 |
| `--color-danger` | `#EF4444` | エラー、危険操作、削除 |
| `--color-text-main` | `#FFFFFF` | 主要テキスト（高コントラスト白） |
| `--color-text-muted` | `rgba(255, 255, 255, 0.4)` | 補助テキスト、ラベル、プレースホルダー |
| `--color-bg-base` | `#000000` | ベース背景（純黒、省電力・屋外ハイコントラスト） |
| `--color-bg-surface` | `#111315` | サーフェス背景 |
| `--color-bg-card` | `rgba(28, 28, 30, 0.65)` | グラスモーフィズムカード背景 |

### 📐 Spacing (8px Grid System)
| CSS Variable | Value | 用途 |
|---|---|---|
| `--space-4` | `4px` | 微細な位置調整 |
| `--space-8` | `8px` | 子要素間の基本余白 |
| `--space-16` | `16px` | コンテナ内部の基本パディング |
| `--space-24` | `24px` | カード間の余白、セクション区切り |
| `--space-32` | `32px` | 大規模セクションの区切り |

### 🔘 Corner Radius & Glassmorphism
| CSS Variable | Value | 用途 |
|---|---|---|
| `--radius-card` | `24px` | 各種グラスモーフィズムカードの角丸 |
| `--radius-btn` | `16px` | ボタン、フォーム入力部品の角丸 |
| `--glass-blur` | `20px` | グラスモーフィズム背景ぼかし |
| `--glass-border` | `1px solid rgba(255, 255, 255, 0.08)` | カード・パネル境界線 |
| `--glass-shadow` | `0 8px 32px 0 rgba(0, 0, 0, 0.37)` | パネル浮き上がりシャドウ |

---

## 4. コンポーネント設計原則 (Component Principles)

現行 Canonical Requirement（規範契約）と現行 Runtime の未達事項（Current Fact）の境界は以下の通りである：

1. **Stateless (ステートレス)**:
   - **Canonical Requirement**: コンポーネントは内部状態やグローバル変数に依存せず、同じデータ入力に対して常に全く同じ HTML 出力を返す（冪等性）。
   - **現行 Runtime の未達事項 (Current Fact)**: `active/dashboard/components/ranking.js` において、`window._myRankingSummary` のグローバル参照が行われている（Deferred UI Runtime Candidate）。
2. **No Direct API Access (API 直接呼び出し禁止)**:
   - **Canonical Requirement / Current Fact**: コンポーネント内部で GAS API や外部通信を行ってはならない。通信はページ層（`render.js` / `app.js`）が担う（現行 Runtime 遵守済み）。
3. **Pure Rendering (純粋レンダリング)**:
   - **Canonical Requirement / Current Fact**: コンポーネントの責務は渡された JSON データから純粋に HTML 文字列を組み立てて返却することである（現行 Runtime 遵守済み）。
4. **No Raw Color Hardcoding (生カラー直書き禁止)**:
   - **Canonical Requirement**: CSS 変数（`--color-*`）を参照し、HTML/JS への直接の色コード埋め込みを禁止する。
   - **現行 Runtime の未達事項 (Current Fact)**: `ranking.js` および `staff.js` において、`#EA5F08` や `#1C1C1E`、`#22c55e` 等の生カラーコードおよびインラインスタイルが残存している（Deferred UI Runtime Candidate）。

---

## 5. 実在共通コンポーネント (Universal Components)

現在 `active/dashboard/components/` に配備されている実在コンポーネントおよび公開インターフェースは以下の通りである：

### ① Bottom Navigation Component (`active/dashboard/components/navigation.js`)
- **責務**: 配布員現場画面（H-App）の下部ナビゲーションバーのレンダリング。
- **インターフェース**: `window.renderBottomNavigation(activePage)`
- **入力**: `activePage` (`'areas' | 'ranking' | 'settings' | 'storage-register' | 'storage-list' | 'bulletin' | 'detail'`)
- **出力**: 下部固定ナビゲーションバーの HTML 文字列。

### ② Ranking Component (`active/dashboard/components/ranking.js`)
- **責務**: 配布実績に基づくランキング一覧・自身のランクサマリのレンダリング。
- **インターフェース**: `window.renderRankingCard(rankingData, myStaffId)`
- **入力**: `rankingData` (Array), `myStaffId` (string)
- **出力**: ランキングカード群および自身ランクサマリの HTML 文字列。

### ③ Staff Component (`active/dashboard/components/staff.js`)
- **責務**: 配布員 ID カードおよびジャイロ効果付き認証カードのレンダリング。
- **インターフェース**: `window.renderStaffCard(userInfo, options = {})`
- **入力**: `userInfo` (Object: `{ id, last, first, picture, registrationDate }`), `options` (Object: `{ districtName, branchName, lastSyncTime }`)
- **出力**: 配布員認証カードの HTML 文字列。

---

## 6. UI ガバナンス規則 (UI Governance Rules)

- **Rule 1: No Custom Inline Styles / Arbitrary Colors**: CSS 変数（`--color-*`）を使用し、HTML/JS への直接の色コード埋め込みを禁止する。
- **Rule 2: Component Reusability**: 共通 UI 部品はコンポーネントとして定義し、画面間でのベタ書き重複を禁止する。
- **Rule 3: Accessibility Compliance**: タップ領域は原則 48px 以上を維持し、屋外での操作性を損なわないこと。
