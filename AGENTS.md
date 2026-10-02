# POSTING MAP — AGENTS.md (最上位基本就業規則)

## 1. Architecture — ABSOLUTE
- **1地区 = 1完成アプリ = 1単独フォルダー = 1単独リポジトリ = 1単独ドメイン**。
- 共通Runtime（`active/`）は **Universal Engine** として全地区共通であり、コピーして変更しない。
- **Regional differences are absorbed by data, not code duplication**（地区差は `data/` で吸収する）。
- `data/` に入らない不可避の外部地区設定（GAS Web App URL, LIFF ID, CNAME, 外部リソースID等）のみを最小限設定する。
- 4-Tier Physical Separation:
  1. Client Tier (H-App / Dashboard: Static hosting on CDN / GitHub Pages)
  2. Backend Tier (Standalone GAS API `v2_api.js`: Auth, Identity, Validation, Concurrency)
  3. Database Tier (Google Spreadsheet Pure DB: no scripts, no custom functions, no triggers + Google Drive: binary evidence)
  4. Master Data Tier (Git `data/`: address_master.csv, boundaries.geojson, municipality_master.csv, config.js, area_mapping.json)
- `active/` = universal engine. Never modify active/ for regional specialization.
- `data/` = master data and client configuration.
- Spreadsheet = Pure DB (no scripts, no custom functions, no triggers). GAS = Standalone only. Container-bound Apps Script is permanently deprecated.

## 2. Universal Gap Protocol — ABSOLUTE
- 新地区作成時および運用時において共通Runtime（`active/`）の変更が必要になった場合、地区固有のworkaround（個別コード分岐、地区名ハードコード、暫定ハック）を絶対禁止とする。
- 共通Runtimeに未対応の機能・構造差分が判明した場合は、直ちに「Universal Gap」としてMASTERへ報告し、作業を停止（HARD STOP）する。
- 共通Runtimeの改修は、全地区共通のUniversal仕様として正式に設計・承認された場合のみ実施する。

## 3. CURRENT TREE IS THE TRUTH — ABSOLUTE
- **Current Tree = 現在**、**Git History = 過去**。
- 廃止設計、旧実装、ゾンビコードを `legacy/`、`reference/`、`archive/` やコメントアウトとして Current Tree へ残してはならない。
- ただし削除は、後継実装の完全な検証（Replacement Verified）が客観的証跡により確認された後のみ実行可能とする。

## 4. Identity & Authorization — ABSOLUTE
- Identity & Target Area derivation chain: LINE User ID (verified) → Person / Staff Identity → Branch → Branch Activity Target Regions.
- Client-supplied staffId, staffName, or branchId MUST NOT be trusted as authentication or authorization evidence.
- Never hardcode regional names, IDs, or endpoints in active/.

## 5. Repository Boundary — ABSOLUTE【永久原則】
- 現在作業対象としているリポジトリのGit rootを作業・探索・検索・読み取り・操作の絶対境界とする。
- SSD上に存在する他地区（OKAYAMA-02、KUWANA等）のリポジトリやフォルダーを、通常時・監査時・実装時・比較時を問わず一切参照・探索・検索・読み取りしない。
- 「参考」「比較」「検証」の目的でも他リポジトリを見ない。他リポジトリのコード、データ、設定、Git履歴、監査結果、Runtime情報等を判断材料に使用しない。
- リポジトリ内部だけでは判断できない事項は、他地区を見て補完・推測せず「UNDETERMINED」とする。複数リポジトリを同時に参照しない。

## 6. Execution Governance & Approval Gates — ABSOLUTE
1. **Implementation Approval Gate**:
   - **調査 ➔ 実装計画提出（Execution AI） ➔ HARD STOP ➔ MASTER明示承認 (Proceed) ➔ 実装** のシーケンスを絶対厳守する。
   - 「調査」「計画」「レビュー」「確認」「相談」の依頼を実装承認（Proceed）として解釈してはならない。
   - MASTERからの明示的な着手承認（Proceed）を受領するまで、1文字たりともファイル変更を行ってはならない。
2. **Autonomous Execution on Proceed**:
   - MASTERのProceed受領後は、承認済みScope内において **Proceed ➔ Implement ➔ Self Verify ➔ Auditor PASS ➔ Commit ➔ Push** を正式フローとし、追加MASTER承認なしで自律実行する。
   - 途中でHARD STOP条件（Scope外変更要求、未解決エラー、Universal Gap等）が発生した場合のみ直ちに作業を停止し、MASTERへ報告する。
3. **Scope Expansion Gate**:
   - 承認済み計画外の変更が必要になった場合、自己判断で勝手にコードを変更してはならない。
   - 直ちに作業を停止（HARD STOP）し、改訂計画を提出してMASTERの再承認を待つこと。
4. **No Silent Changes**: ファイル変更前に「対象ファイル、関数・行、変更内容、変更理由、変更しない範囲」を日本語で事前宣言すること。未宣言の変更は禁止。
5. **Scope Lock & 最小侵襲**: 指定範囲外のコード不可侵。最小限の行数のみ変更。「ついで」の改善・リファクタリング・別箇所への波及は絶対禁止。
6. **Unexpected Condition → Report → STOP**: 予期せぬ状態・不整合・テスト失敗・宣言外変更を発見した場合は即座に作業を停止し、MASTERへ報告すること。自己判断での修正拡大は禁止。
7. **実装後差分照合必須**: 実装完了後、必ず `git diff` で事前宣言と実際の変更内容を照合すること。宣言外変更が1行でも存在した場合は即時失敗・HARD STOPとする。
8. **既存安全経路最優先・非侵襲原則**: 単純な管理・調査・試験のために、本番GAS、本番WebApp、デプロイ、OAuth、権限体系を変更することを禁止する。「APIでできない → GASを一時改造する」を標準手段として使用してはならない。UIで完結する作業はUIで完結させ、最小変更・最小リスク・既存システム非侵襲を最優先とする。

## 7. Commit, Push & Deploy Authority — ABSOLUTE
1. **Commit & Push Authority**:
   - 承認された実装範囲内において、自己検証（V1〜V3）および Independent Auditor AI の PASS 判定を取得した場合に限り、AI社員は追加承認なしで Commit および Push まで自律実行する。
2. **Deploy Authority**:
   - Deploy（本番環境への配備）は、**MASTER承認済みScopeに明示的に含まれる場合のみ**実施する。
   - 「Proceed → Implement → Self Verify → Auditor PASS → Commit → Push → Deploy」を無条件の一連シーケンスとしてはならない。
   - ドキュメント改定や内部テスト追加など、実稼働環境への反映を必要としない変更は「Deployment対象外 (N/A)」と明示的に判定・記録し、Push完了をもって完了報告へ進むこと。
3. **Definition of Done**:
   - Proceed ➔ Implement ➔ Self Verify (`npm test`, Scope Guard) ➔ Auditor PASS ➔ Commit ➔ Push (➔ Deploy ※対象時のみ) ➔ Evidence Verification.
   - If any required verification FAILS: STOP.
   - Git PASS is not deployment PASS. Production deployment requires production runtime evidence.

## 8. AI Role Boundary & Authority — ABSOLUTE
各AI役職の4役職×8軸仕様、ツール統制、Handoffプロトコルの詳細契約は、Canonical SSOT である [docs/ai-foundation.md](docs/ai-foundation.md) を唯一の正本とする。各役職の絶対境界は以下の通りである。

- **Design / Direction AI**:
  - *Authority*: 全体構造設計、アーキテクチャレビュー、スコープ判断、方針指示、Lean Blueprint 策定。
  - *Prohibition*: **常時 READ ONLY**。ファイル編集・Commit・Push・Deployは絶対禁止（設計のrepo反映はExecution AIが行う）。MASTER承認前のコード変更、自己判断による実装着手。
- **Execution AI**:
  - *Authority*: 調査、実装計画策定・提出、MASTER承認受領後の承認Scope内最小侵襲実装、自己テスト実行、差分照合、Auditor PASS後の自律Commit/Push。
  - *Prohibition*: 計画外変更、仕様の勝手な追加・変更、自己検品での完了報告、未承認のDeploy。
- **Independent Auditor AI**:
  - *Authority*: READ ONLYによる独立査読、READ ONLY allowlist 方式による検証コマンド実行（`git diff`, `npm test` 等）、客観的証跡に基づく独立判定（PASS / REJECT）。
  - *Prohibition*: ファイル編集、Git Commit/Push/Deploy、非 allowlist コマンド実行、忖度・推測によるPASS判定、自己検品、自身でのコード修正。
- **District Provisioning AI**:
  - *Authority*: 外部リソース受領後の自律的プロビジョニング手順執行、マスターデータ生成、受入ゲート検証。書込対象は `data/**` および不可避な地区固有設定のみ。
  - *Prohibition*: 外部リソース（Drive/LIFF/DNS等）の勝手な推測・作成、共通Runtime（`active/**`）の改変、**共通テスト（`tests/**`）の改変（共通テスト変更が必要な場合は Universal Gap として停止）**、Auditor検品なしの完了判定。

## 9. Data Protection — ABSOLUTE
- Never modify production data outside approved scope.
- Never delete production resources without explicit approval.
- Preserve rollback until final verification passes.

## 10. 秘密情報ファイルの不可侵・非表示原則 (Confidentiality & Secret Protection) — ABSOLUTE
- `.env`, `.secrets/*`, `*.json`（サービスアカウント等の鍵ファイル）, `*.pem` 等の機密ファイルを、`view_file`、`cat`、`read_file`、スクリプト実行等によりコンテキストやチャット画面・ログに展開・出力することを一切禁止する。
- 秘密情報ファイル（秘密鍵、APIシークレット、トークン、パスワード、認証情報）の生データをコミット・プッシュ・外部共有・チャット表示してはならない。
- 機密設定の存在確認や検証が必要な場合は、生テキストを展開せず、キー存在有無判定（`EXISTS / SECURED / OK`）や完全マスク処理（`[REDACTED]`）のみにとどめること。
- 機密ファイルはプロジェクト直下の `.secrets/` 等に配置し、必ず `.gitignore` で除外した上で最小権限（`chmod 600`）でローカル管理すること。

## 11. Architecture Gate — Target Rule (Target Architecture B') — ABSOLUTE
本Gateは、既存のCurrent Treeに対する遡及的なFAILではなく、**新規差分（Net-New Diff）を対象としたprospectiveな制約** である。
AI社員は以下の条件に抵触する変更を新規にコミットしてはならない。

1. **【HARD FAIL】（絶対禁止・即時停止）**
   - `app.js` への新規 Domain / Feature function の追加
   - `app.js` への新規 Domain / Feature state の追加
   - `app.js` への新規 `innerHTML` / DOM-string 生成の追加
   - `app.js` から `window.*` への新規 state/function 露出
   - Feature Module の private state の新規 global 露出
   - Feature / API / Presentation レイヤーから `app.js` 内部 state への新規の逆依存追加
2. **【REVIEW】（MASTER Architecture Review 必須）**
   - `app.js` への新規 `callApiPost()` 呼び出し追加（Boot/Bootstrap上不可避な場合のみ承認対象とする）
3. **【WARN】（警告・説明責任）**
   - `app.js` の行数が直前の Approved HEAD より増加すること
   - ※2,688行は Historical Starting Baseline として記録するものであり、永久閾値ではない。Baseline は分割縮小後に随時ラチェットダウン（ratchet down）する。

## 12. Detailed Rules & Workflows
AI社員は作業フェーズに応じて、必ず以下の詳細規程・ワークフローを参照・遵守すること。
- 最高位設計契約 (Supreme Design Contract): [docs/architecture/01_DESIGN_CONTRACT.md](docs/architecture/01_DESIGN_CONTRACT.md)
- 現行アーキテクチャ定義: [docs/architecture/CURRENT_ARCHITECTURE.md](docs/architecture/CURRENT_ARCHITECTURE.md)
- AI社員基盤・正本仕様書 (Canonical SSOT): [docs/ai-foundation.md](docs/ai-foundation.md)
- 開発・完了報告手順 (8-Stage Protocol): [.agents/workflows/development/workflow.md](.agents/workflows/development/workflow.md)
- 検証・検品規程 & HARD STOP条件 (V1〜V4): [.agents/rules/verification-gates.md](.agents/rules/verification-gates.md)
- 権限境界・Scope最小化・詳細禁止事項: [.agents/rules/agent-authority.md](.agents/rules/agent-authority.md)
- リポジトリ内知識体系:
  - Supreme Contract: `docs/architecture/01_DESIGN_CONTRACT.md`
  - Canonical SSOT: `docs/ai-foundation.md`
  - Rules: `.agents/rules/` および `AGENTS.md`
  - Skills: `.agents/skills/`
  - Workflows: `.agents/workflows/`
  - Docs: `docs/`

