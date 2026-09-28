# POSTING MAP Universal Design System Specification

- **Version**: 2.0.0
- **Status**: ACTIVE / CANONICAL SSOT
- **Supreme Authority**: [AGENTS.md](../../AGENTS.md)
- **Master Plan**: [01_DESIGN_CONTRACT.md](01_DESIGN_CONTRACT.md)
- **Token Source of Truth**: [active/dashboard/style.css](../../active/dashboard/style.css) (`:root`)

本書は、POSTING MAP Universal Engine（H-App / Dashboard）における UI/UX 設計標準およびガバナンスの唯一の正本（Single Source of Truth）である。旧 `DESIGN_GOVERNANCE.md` を統合し、デザイン変数の定義からコンポーネント責務境界までを一元規定する。

---

## 1. Design System Architecture & 責務境界

```text
Design Tokens (active/dashboard/style.css :root)
       │
       ▼
Components (active/dashboard/components/ : JS Functions)
       │
       ▼
Pages (Composition / render.js)
```

1. **Design Tokens (`active/dashboard/style.css` `:root`)**:
   - 見た目の設計変数（色、余白、角丸、シャドウ）の唯一の正本（SSOT）。
   - コードベース内の CSS カスタムプロパティとして管理され、外部ファイルや架空の JSON に依存しない。
2. **Components (`active/dashboard/components/`)**:
   - 再利用可能な UI レンダリングコンポーネントの SSOT。
   - 状態を持たず（**Stateless**）、外部 API を直接叩かず（**No Direct API Access**）、入力データから純粋に HTML 文字列または DOM 要素を構築して返却する。
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

1. **Stateless (ステートレス)**:
   - コンポーネントは内部状態を保持しない。同じデータ入力に対して常に全く同じ HTML 出力を返す（冪等性）。
2. **No Direct API Access (API 直接呼び出し禁止)**:
   - コンポーネント内部で GAS API や外部通信を行ってはならない。通信はページ層（`render.js` / `app.js`）が担う。
3. **Pure Rendering (純粋レンダリング)**:
   - コンポーネントの責務は渡された JSON データから HTML 文字列または DOM 要素を組み立てることのみである。

---

## 5. 実在共通コンポーネント (Universal Components)

現在 `active/dashboard/components/` に配備されている実在コンポーネントは以下の通りである：

### ① Bottom Navigation Component (`active/dashboard/components/navigation.js`)
- **責務**: 配布員現場画面（H-App）の下部ナビゲーションバーのレンダリング。
- **インターフェース**: `renderBottomNavigation(activePage)`
- **入力**: `activePage` (`'areas' | 'ranking' | 'settings' | 'storage-register' | 'storage-list'`)
- **出力**: 下部固定ナビゲーションバーの HTML 文字列。

### ② Ranking Component (`active/dashboard/components/ranking.js`)
- **責務**: 配布実績に基づくランキング一覧・統計情報のレンダリング。
- **インターフェース**: `renderRanking(rankingData, container)`
- **入力**: ランキング集計データ配列、描画先 DOM コンテナ。
- **出力**: ランキングカード群の DOM 描画。

### ③ Staff Component (`active/dashboard/components/staff.js`)
- **責務**: スタッフ情報・名簿・保有チラシ情報カードのレンダリング。
- **インターフェース**: `renderStaff(staffData, container)`
- **入力**: スタッフ情報オブジェクト、描画先 DOM コンテナ。
- **出力**: スタッフカード要素の DOM 描画。

---

## 6. UI ガバナンス規則 (UI Governance Rules)

- **Rule 1: No Custom Inline Styles / Arbitrary Colors**: CSS 変数（`--color-*`）を使用し、HTML/JS への直接の色コード埋め込みを禁止する。
- **Rule 2: Component Reusability**: 共通 UI 部品はコンポーネントとして定義し、画面間でのベタ書き重複を禁止する。
- **Rule 3: Accessibility Compliance**: タップ領域は原則 48px 以上を維持し、屋外での操作性を損なわないこと。
