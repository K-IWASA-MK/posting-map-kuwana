---
name: district-provisioning
description: 新地区の初期展開、GAS生成、デプロイ、スプレッドシート接続、フロントエンド同期を行う際の専門能力と安全プロトコル。新地区フォルダーのセットアップや再プロビジョニング時に使用する。
---

# Skill: District Provisioning Protocol（地区独立展開プロトコル v1）

本スキルは、POSTING MAPのコピー元テンプレートから複製された新地区フォルダーを、完全独立した稼働システムへと安全に昇華させるためのAI社員専属の公式業務プロトコルである。  
地区固有情報はすべてスプレッドシート名（SSOT）と `data/` のマスターCSV一式からのみ動的に導出し、コード側に地区固有値を1文字も書き込まない「完全分離型アーキテクチャ」を厳格に執行する。

---

## 1. 職責と基本原則（Purpose & Principles）

1. **完全分離型アーキテクチャの執行**:
   - スプレッドシートは「純粋なデータ層（DB）」として扱い、プログラムコードを持たせない。
   - GASはスプレッドシートから独立した「スタンドアロンAPIサーバー」として外部展開する。
   - スプレッドシートの「拡張機能 → Apps Script」を手作業で操作する方式へ逆戻りすることを絶対禁止とする。
2. **Action → Assertion/Evidence → Hard Stop → Prohibition**:
   - すべての作業工程は、実行内容（Action）、客観的合格基準（Assertion/Evidence）、強制停止条件（Hard Stop）、禁止事項（Prohibition）の4要素をセットとして運用する。
3. **No Evidence No PASS（推測PASSの絶対禁止）**:
   - 「動いたと思われる」「設定したはず」は一切認めない。実際のコンソールログ、HTTPステータスコード、JSONレスポンス等の客観的証跡が存在して初めてPASSと判定する。

---

## 2. 発動条件（Triggers & Readiness）

本スキルは、**「フォルダーの状態（Readiness）」** と **「人間の指示（Intent）」** の双方が揃った交差点でのみ発動する。

### 発動前提（Readiness Check）
- [ ] コピー元にて [district-pre-copy-rule.md](../../rules/district-pre-copy-rule.md) の全10項目およびコピー前ゲートが PASS していること。
- [ ] [district-data-transition-rule.md](../../rules/district-data-transition-rule.md) に従い、新地区マスター3点セットの交換および area_mapping 初期化が完了していること。
- [ ] 自身のカレントディレクトリが当該地区リポジトリのルート（`./`）であること。
- [ ] `data/address_master.csv` および `data/municipality_master.csv` が配置されていること。
- [ ] `deployment.json` に新地区のパラメータ（`districtId`, `spreadsheetId`, `storageFolderId`）が宣言されていること。

### 発動契機（Intent）
- 人間から「新地区を展開して」「プロビジョニングを開始して」「地区セットアップを実行して」等の明示的な指示を受領したこと。
- **注意**: ファイルやフォルダーが存在するだけでAIが自律的に本番リソースを作成することは絶対禁止とする。

---

## 3. 必須Context（入力契約）

本スキルが動作するために必要なフォルダー内コンテキストは以下の3点のみである。これ以外の外部依存を持ってはならない。

1. **`data/`（マスターCSV一式）**:
   - `data/address_master.csv`: 町丁目・座標データ
   - `data/municipality_master.csv`: 自治体マスターデータ
2. **`deployment.json`（リソース宣言台帳）**:
   - `districtId`: 地区識別子（例: `OKAYAMA-02`）
   - `resources.spreadsheetId`: 対象Googleスプレッドシートの物理ID
   - `resources.storageFolderId`: 対象Googleドライブフォルダの物理ID
3. **Google Spreadsheet（名前SSOT）**:
   - スプレッドシート名そのものが `districtId` と完全一致していること。

---

## 4. 継承ゲート（AI社員自己診断 / Preflight Check）

前世代（OKAYAMA-02等）からコピーされた新フォルダーに着任したAI社員は、いかなる変更作業も開始する前に、まず自身の着任状態を自己診断しなければならない。

### 自己診断チェックリスト（継承受入テスト）
1. **能力認識**: 自身のフォルダー内に `.agents/skills/district-provisioning/SKILL.md` が存在し、利用可能であることを確認。
2. **規律認識**: `AGENTS.md` が読み込まれ、管轄相対性と強制Skillロードルールを理解していることを確認。
3. **汚染防止**: 前世代の地区名や固有IDが `active/` 配下に誤って残存していないか静的スキャン（`grep_search`）を実施。
4. **リソース到達性**: 宣言された `spreadsheetId` および `storageFolderId` に対し、アクセス権があることを確認。

---

## 5. 実行パイプライン（5段階ライフサイクル）

### Phase 1: Preflight Protocol（静的監査フェーズ）
* **Action**:
  - `data/` 配下のCSVの構文、行数、ヘッダーカラムを検証。
  - `deployment.json` の宣言値の構文および必須フィールドの存在を検証。
  - スプレッドシート名を取得し、`districtId` と完全一致することを確認。
  - 監査結果をまとめた `preflight_report.md` を作成。
* **Assertion / Evidence**:
  - CSVパース完了ログ、スプレッドシート名一致ログ、`preflight_report.md`。
* **Hard Stop**:
  - スプレッドシート名と `districtId` が不一致（SSOT違反）、CSV破損、リソース不在時は即時停止。
* **Prohibition**:
  - このフェーズで Google リソース（GAS、Drive等）を作成・変更することは一切禁止。

---

### 🛑 HUMAN PROCEED GATE（強制停止関門・自己承認排除）
* **規則**:
  - Preflight 完了後、AI社員は**直ちにツール呼び出しを強制終了（ターンを終了）**する。
  - 人間に Preflight レポートを提示し、「実行承認（Proceed）」を明示的に要求する。
  - **人間がチャットで「Proceed」と発話するまで、以降のフェーズ（Phase 2以降）へ進むことを物理的・ルール的に絶対禁止とする。**（※AIが自作自演で承認フラグを立てることは AGENTS.md 重大違反）

---

### Phase 2: Standalone Infrastructure Protocol（GAS基盤生成）
* **Action**:
  - `npx @google/clasp create --title "POSTING-MAP-${DISTRICT_ID}" --type standalone --rootDir ./active` を実行。
  - `npx @google/clasp push` を実行し、`active/` 配下の全コードを独立GASへ転送。
  - `npx @google/clasp deploy --description "Production ${DISTRICT_ID} v1"` を実行し、Web App URLを発行。
* **Assertion / Evidence**:
  - 新規 Script ID の発行ログ、42ファイル転送完了ログ、Deployment ID および Web App URL の取得ログ。
* **Hard Stop**:
  - `clasp` コマンド失敗、不要ファイルの混入検知時は即時停止し、勝手に再試行を繰り返さない。
* **Prohibition**:
  - スプレッドシートを開いて「拡張機能 → Apps Script」を手作業で操作することは絶対禁止。

---

### ⚠️ OAUTH CONSENT CHECKPOINT（オーナー権限同意関門）
* **規則**:
  - 新設されたスタンドアロンGASは、Googleのセキュリティ仕様上、初回実行時にオーナーアカウントによるブラウザでのアクセス権限同意（OAuth同意）が必須となる。
  - AI社員はエディタURL（`https://script.google.com/d/${SCRIPT_ID}/edit`）を提示し、人間へ「権限を確認」のワンクリックを依頼して**一時停止**する。
  - 人間からの「承認完了」の通知を受領後、`curl /exec?action=getSystemSummary` 等で疎通を確認して次のPhaseへ復帰する。

---

### Phase 3: Bootstrap & SSOT Binding Protocol（安全な自動注入・外部サービス自動構成）
* **Action**:
  - `bootstrapEnvironment` API を POST リクエストで呼び出し、Script Properties へパラメータを一括注入。
  - 注入パラメータ: `DISTRICT_ID`, `TARGET_SPREADSHEET_ID`, `STORAGE_PARENT_ID`, `PROVISIONING_TOKEN_HASH`。
  - **Google Maps APIキー自動投入（【項目③】）**:
    - 共通秘密情報 `POSTING_MAP_GOOGLE_MAPS_API_KEY` をプロビジョニングパイプライン（`scripts/provision-district.mjs`）を通じて GAS Script Properties へ自動投入。
    - キー未設定時は即時 **HARD STOP (exit 1)**。キー値そのものは Git、ログ、画面、報告書へ一切露出させず、`GOOGLE_MAPS_API_KEY: PRESENT` のみ確認・記録する。
  - **Spreadsheet DB行順完全同期（【項目②】）**:
    - `npm run provision:district -- --reset-existing-records` を実行し、`data/address_master.csv` の確定行順（五十音順SSOT）を「配布実績の原本」および当月業務シート「配布実績YYYY-MM」へ 100% 同期。
    - 新地区製造時は既存テストデータを全消去し、全件クリーン初期化（進捗率0.0%）。
  - 新地区構築時に必要な外部サービス連携（LINE Messaging API等）は、人間への手動設定依頼を完全排除し、プロビジョニングパイプライン（`provision-district.mjs` ➔ `SystemInfoService.syncSystemInfo`）を通じて自動構成する。
  - プロビジョニング認証はプラットフォーム共通シークレット（`CORE_PROVISIONING_HASH`）によってゼロコンフィグで通過させ、人間に未知のトークン手入力を求めない。
* **Assertion / Evidence**:
  - レスポンス `{"success": true, "message": "Environment bootstrapped successfully."}` の取得。
  - 実機API `GET /exec?action=getSystemSummary` を実行し、返却値 `districtName` が対象スプレッドシート名と動的一致することの客観的ログ。
  - `syncSystemInfo` レスポンスにおいて `lineConfigured: true` が返却されること。
  - `verify:gas` 実行時に `GOOGLE_MAPS_API_KEY: PRESENT` が出力されること。
  - 「配布実績の原本」および「配布実績YYYY-MM」の行順が `address_master.csv` と 100% 一致すること。
* **Hard Stop**:
  - `UNAUTHORIZED`（トークン不正）、`DISTRICT_MISMATCH`（地区不一致）、`RESOURCE_NOT_FOUND`、Google Maps APIキー未設定（`MISSING`）、原本/当月シート行順不一致、外部サービス未構成時は即時停止。
* **Prohibition**:
  - 平文のプロビジョニングトークンやAPIキーをGASやGitに保存・コミットすることは禁止（SHA-256ハッシュのみ保持、APIキーは環境変数からScript Propertiesへ直接投入）。
  - 人間に手作業でトークン値やAPIキーの調査や手動設定を要求することの絶対禁止（ゼロ手作業原則）。
  - GAS管理画面や外部コンソールを手動で開いて設定させる手順に依存することの絶対禁止。

---

### Phase 3.5: District Base URL & SYSTEM_INFO Protocol（地区固有URL動的注入）
* **Action**:
  - `CNAME`（または環境変数 `DISTRICT_BASE_URL`）から `districtBaseUrl` を動的解決。
  - パイプライン: `CNAME` ➔ `provisioning runtime` ➔ `districtBaseUrl` ➔ `GAS API (syncSystemInfo)` ➔ `SYSTEM_INFO` シート。
  - GAS側（`system_info_service.js`, `district_provisioner.js` 等）には固定フォールバック（`'https://postingmap.jp'`）を一切残さず、渡された `baseUrl` または既存シート値を厳密に使用。
  - フロントエンドおよびマークアップ（`index.html` の OGP, `active/manager/index.html` の script/css 参照）は絶対URLではなく相対パスを徹底。
  - GASリッチメニュー画像（`v2_ui.js`）等もハードコードを排除し、`SYSTEM_INFO` の `HアプリURL`（SSOT）から動的に組み立てる。
* **Assertion / Evidence**:
  - `action=getSystemInfo` の実行レスポンスにおいて、`HアプリURL`, `Dashboard URL`, `Endpoint URL` がすべて新地区の `https://<district-domain>/` に更新されていること。
  - 親機・前世代ドメインの残存ヒットが全レイヤーで 0件 であること。
* **Hard Stop**:
  - `SYSTEM_INFO` に旧URLが残存している場合、またはコード内に固定URLフォールバックが存在する場合は即時停止。

---

### Phase 4: Client Synchronization Protocol（フロントエンド自動結合）
* **Action**:
  - `deployment.json` に新 Web App URL およびリソース情報を記録。
  - `npm run sync:config` を実行し、`data/config.js` を SSOT から自動生成（`active/` 配下は完全不変・0変更を維持）。
  - `npm run check:ssot` を実行し、エンドポイントの整合性を検証（`active/` 内に旧 `config.js` が存在しないことも検証）。
  - 読み取り専用API（`getSystemSummary`, `getDeviceStatus`, `getTier1`）を実行して接続を検証。
  - スプレッドシートDBの「配布実績の原本」および「配布実績YYYY-MM」のA列ID・C列町域の全行順序が、確定済み `data/address_master.csv` の行順と 100% 完全一致することを検証。
* **Assertion / Evidence**:
  - `sync:config` 成功ログ、`check:ssot` PASS ログ、読み取りAPIの正常応答（200 OK）、Spreadsheet DB全行ID順序一致ログ、`git diff active/` が完全 0 バイトであること。
* **Hard Stop**:
  - SSOT 不一致、古いエンドポイントの残存、APIエラー、原本/当月シート行順不一致、`active/` 配下に差分が発生した場合は即時停止。
* **Prohibition**:
  - `active/` 配下のファイル（HTML/JS/CSS）へ直接設定ファイルを出力・変更することは絶対禁止。
  - フロントエンドコード（`app.js`, `manager.js` 等）に地区固有値を直接ハードコードすることは禁止。
  - 接続テストのために不要な業務データ（配布実績、名簿等）の書き込み（Write）を行うことは絶対禁止。

---

### Phase 5: Audit & Evidence Protocol（独立検品と記録）
* **Action**:
  - 独立監査サブエージェント（`auditor`）へ検品依頼パッケージ（タスク、差分、客観的Evidence）を提示。
  - `npm run audit:gate` を実行し、Scope Guard を通過。
  - 実証記録を `.agents/records/record-xxx.md` として書き出し。
* **Assertion / Evidence**:
  - Auditor PASS 判定ログ、Audit Gate PASS ログ、作成された記録ファイル。
* **Hard Stop**:
  - Auditor から REJECT された場合、または未解決のエラーが存在する場合は完了報告禁止。
* **Prohibition**:
  - Evidence なき PASS 判定（推測PASS）は絶対禁止。

---

## 6. 絶対禁止事項（General Prohibitions）

本スキルを執行するにあたり、以下の行為を永久に禁止とする：
1. **業務データへの書き込み禁止**:
   テスト目的でスプレッドシートの業務シート（配布実績、名簿、契約端末等）にテストデータを投入してはならない。
2. **スプレッドシート付属GASの改変禁止**:
   スプレッドシートをコピーした際に付随する旧コンテナバウンドGAS（未デプロイ残骸）は改変・デプロイしてはならない。
3. **他地区リソースへの接触禁止**:
   MIE-03等の他地区スプレッドシート、他地区GAS、親リポジトリへのアクセス・変更は一切禁止。
4. **自己承認によるデプロイ禁止**:
   人間の明示的な `Proceed` なしに、AI社員自身の判断で Phase 2（インフラ作成）へ進んではならない。
5. **APIキー未設定でのデプロイ・稼働進行の禁止**:
   `POSTING_MAP_GOOGLE_MAPS_API_KEY` が未設定のままプロビジョニングやデプロイを進行させることは絶対禁止（未設定時は即時 HARD STOP）。
6. **APIキー平文出力の絶対禁止**:
   APIキー値をログ、Gitコミット、報告書等に平文で出力・露出させてはならない（`PRESENT` / `MISSING` のみ記録）。
7. **Spreadsheet DB行順不一致の放置禁止**:
   `address_master.csv` の確定行順（五十音順SSOT）と異なる順序でスプレッドシートの原本・当月シートを放置・運用してはならない。

