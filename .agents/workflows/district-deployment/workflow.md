# Workflow: District Deployment（新地区完全自律展開オーケストレーション）

本ワークフローは、MASTERからの「地区名」および「新地区用ドメイン」の2点提示のみを起動トリガーとし、AI組織（Flash / Deployer / Auditor）が自律連携して、新地区を本番稼働状態（Hアプリ・Dashboard PC・Dashboard Mobile・本番GAS・本番Spreadsheet DB・独立Git）まで完全自動で完走させる**新地区展開オーケストレーションの公式正本**である。

---

## 🏛️ 最上位絶対原則 & 人間／AI責任境界

### 1. 人間（MASTER）の責務（2入力限定の原則）
MASTERが新地区展開時に提示する情報は、以下の**2点のみ**とする：
1. **地区名**（例: `桑名市` または `桑名`）
2. **新地区用ドメイン**（例: `kuwana.postingmap.jp`）
※「地区名」と「ドメイン」は明確に別個の入力として定義する。

### 2. 途中質問・追加ID要求の絶対禁止【Workflow違反規程】
AI組織は上記2点を受領した瞬間から、人間に対して以下の情報を**質問・要求してはならない**。
- 自治体コード（全国地方公共団体コード）
- 地区ID（`districtCode`）
- Google スプレッドシートID
- Google Drive 写真フォルダID
- GAS Script ID / Deployment ID / WebApp URL
- LINE LIFF ID / LIFF URL
- CNAME レコード
- `deployment.json` の各設定値

**AI組織が途中で人間へこれらを尋ねたり入力を求めた時点で「Workflow違反（HARD STOP）」とする。**

---

## 🧭 全体オーケストレーション経路（Lean 6-Step Pipeline）

```text
MASTER入力: 【地区名】 ＋ 【新地区用ドメイン】
      ↓
［STATE 0: SOURCE_VERIFY（親機純度検証）］
  担当: Auditor（READ ONLY）
  ・Working Tree Clean確認
  ・npm run check:purity（親機純度100%検査）
      ↓ PASS
［STATE 1: REPLICA_INIT_AND_GIT_ISOLATION（複製 ＆ Git独立化）］
  担当: Deployer
  ・新地区フォルダー物理複製
  ・gh repo create による独立GitHubリポジトリ自動発行
  ・新origin接続 ＆ 初回push ＆ 旧origin物理遮断
      ↓ PASS
［STATE 2: DATA_RESOLVE_AND_AUDIT（データ自動解決 ＆ 検品）］
  担当: Deployer ➔ Auditor
  ・地区名から公定マスターによる自治体特定・データ調達
  ・境界GeoJSON / 住所マスター / 選挙データ生成
  ・validate-district-data-gate ＆ Auditor独立承認
      ↓ PASS
［STATE 3: SYS_INFO_DERIVATION（構成情報自動導出）］
  担当: Deployer
  ・ドメインから CNAME、HアプリURL、Dashboard URL、districtCode を確定
  ・resourceSpecs（作成すべきインフラ仕様）の確定
      ↓ PASS
［STATE 4: INFRA_PROVISIONING（外部インフラ自動構築）］
  担当: Deployer
  ・公式テンプレートから新地区スプレッドシート複製
  ・Drive写真保存フォルダ（<DISTRICT>_PHOTOS）生成
  ・GAS プロジェクト配備 ＆ safe-deploy ＆ プロビジョニング
  ・シート集合検証: 実シート集合 == district_provisioner.js の SSOT期待シート集合
  ・Pages Custom Domain 設定 ＆ HTTPS疎通（HTTP 200 OK）確認
      ↓ PASS
［STATE 5: RUNTIME_AUDIT（本番稼働E2E 5重検証）］
  担当: Deployer ➔ Auditor
  ・Hアプリ本番URL（LIFF/現場操作/API疎通）PASS
  ・Dashboard PC本番URL（大画面/全ピン描画/API疎通）PASS
  ・Dashboard Mobile（スマホviewport 390x844/横崩れなし/ズーム/操作）PASS
  ・本番GAS（verify:gas HTTP 200/全API正常応答）PASS
  ・本番DB（進捗率0.0%/原本件数整合/運用残骸0件）PASS
      ↓ ALL PASS
［完了引渡（Auditor ➔ Deployer / Flash）］
  ・Auditor 独立査読 PASS（客観的エビデンスに基づく確定判定）
  ・Deployer / Flash: 確定成果物の git add / commit / push
      ↓
［DELIVERY（完成納品）］
  MASTERへ全本番URLを提示して完了
```


---

## 📋 各Stateの執行手順 ＆ 完了基準

### State 0: SOURCE_VERIFY（親機純度検証）
- **担当**: Auditor（完全 READ ONLY）
- **Action**:
  1. `git status --porcelain` を実行し、親機が `working tree clean`（差分ゼロ）であることを確認。
  2. `npm run check:purity`（実体: `scripts/check-pre-copy-purity.mjs`）を実行し、親機に特定地区の実体設定・RAWデータ・不要残骸が存在しないことを機械検証。
  3. `DEPLOYMENT_REGISTRY.md` の公式空テンプレート `POSTING_MAP_EMPTY_TEMPLATE`（ID: `1_fvgpNsK2fmz6hYgraDUnvyn69JnphmbgnXcOvzLYeY`）の存在を確認。
- **PASS条件**: Working tree clean ＆ `check:purity` ALL PASS。
- **REJECT時**: **HARD STOP**。親機の汚染・未コミット変更が解消されるまで新地区展開の開始を禁止し、MASTERへ報告。

---

### State 1: REPLICA_INIT_AND_GIT_ISOLATION（複製 ＆ Git独立化）
- **担当**: Deployer
- **Action**:
  1. 親機フォルダーから新地区フォルダー（`posting-map-<district>`）へ物理複製。
  2. `gh repo create posting-map-<district> --public --description "POSTING MAP <district>"` を実行し、独立したGitHubリポジトリを発行。
  3. 新地区フォルダー内で `git remote add origin https://github.com/<ORG>/posting-map-<district>.git`（または set-url）を実行。
  4. 初期化コミットを作成し、`git push -u origin main` で初回プッシュを完了。
  5. 親機リモートへの経路が完全に遮断されていることを確認（AGENTS.md 第2条）。
- **PASS条件**: 新リポジトリへの初回push完了 ＆ 親機への誤爆経路ゼロ確認。
- **REJECT時**: State 1 先頭へ戻り、フォルダー再作成・Git再初期化を試行。

---

### State 2: DATA_RESOLVE_AND_AUDIT（データ自動解決 ＆ 検品）
- **担当**: Deployer ➔ Auditor
- **Action**:
  1. MASTERから受領した「地区名」に基づき、公定マスターから正式自治体名・自治体コード（5桁）を機械特定。
  2. `census-small-area-master` プロトコルを起動し、`scripts/generate-boundaries-geojson.py` を実行して `address_master.csv`, `boundaries.geojson`, `municipality_master.csv` を生成。
     - **【項目①】町名五十音順SSOT化の自動執行**: 生成直後に `python3 scripts/sort-address-master.py` を実行し、日本郵便公定カナに完全準拠した五十音順へ整列する。
       - 表示文字列（`town_name`）は1文字も改変しない。
       - `rowId`（1..N）の数値そのものは100%保持し、絶対に振り直さない。
       - `e_stat_code` 等との属性対応を完全に維持する。
  3. `data/area_mapping.json` を空配列 `[]` に初期化。直近過去3回の選挙結果を `data/election_history.json` へ反映。
     - **【項目④】小選挙区構成自治体からの保管場所自動確定**: 地方選挙モードにおける既存確定ロジックに基づき、基準自治体が属する衆議院小選挙区の全構成自治体（例: 桑名市なら三重3区の8市町: 桑名市、いなべ市、木曽岬町、東員町、菰野町、朝日町、川越町、四日市市）を `data/storage_locations.json` へ自動確定する。単一市への狭窄や他地区残骸を排除する。
  4. `node scripts/validate-district-data-gate.mjs` を実行。町名五十音順（Rule-03/ソート整合）および小選挙区構成自治体ホワイトリスト（Rule-06）を機械検査。
  5. Auditor が独立査読を実施（データ純度・五十音順・前地区残骸ゼロ・境界有効性を検査）。
- **PASS条件**: `validate-district-data-gate` ALL PASS（五十音順・小選挙区自治体純度含む） ＆ Auditor 承認。
- **HARD STOP条件**: 読み仮名未解決町名が存在、`rowId` 重複・欠番、または小選挙区構成自治体以外の他地区残骸が1件でも検知された場合は即時 **HARD STOP (exit 1)**。
- **REJECT時**: State 2 先頭へ戻り、パラメータ再調整・データ再生成を実施（State 1 の Git は維持）。

---

### State 3: SYS_INFO_DERIVATION（構成情報自動導出）
- **担当**: Deployer
- **Action**:
  1. MASTERから受領した「新地区用ドメイン」に基づき、`CNAME` 文字列を導出。
  2. ドメインから Hアプリ本番URL（`https://${domain}/`）および Dashboard本番URL（`https://${domain}/active/manager/`）を導出。
  3. 地区識別子（`districtCode`）を正規化。
  4. 次工程で作成すべき外部リソース仕様（`resourceSpecs`: Spreadsheet名、Driveフォルダ名、GASタイトル等）を確定。
- **PASS条件**: 全構成情報が矛盾なく導出・確定されていること。
- **REJECT時**: State 3 先頭へ戻り、内部で再導出（MASTERへは聞き返さない）。

---

### State 4: INFRA_PROVISIONING（外部インフラ自動構築）
- **担当**: Deployer
- **Action**:
  1. 公式テンプレート（`POSTING_MAP_EMPTY_TEMPLATE`）から新地区スプレッドシートを複製・リネーム。
  2. 写真保存用 Google Drive フォルダ（`<DISTRICT>_PHOTOS`）を生成し、`storageFolderId` を取得。
  3. 新規 Standalone GAS プロジェクトを配備し、`node scripts/safe-deploy.mjs` で本番コードを反映。
  4. 初回 OAuth 同意（Consent Checkpoint）を通過し、GAS エディタ経由での実行権限を確立。
  5. **LIFF 自律発行・ID 抽出（Autonomous LIFF Provisioning）**:
     - `npm run liff:acquire` を実行。
     - ローカルブラウザ（Chrome CDP `[::1]:9222`）に接続し、LINE Developers のログイン済みセッションを利用。
     - 地区固有 LIFF（`POSTING-MAP-<DISTRICT>` かつ `Endpoint = https://${domain}/`）を探索。
     - **厳格な冪等判定**:
       - 地区固有 APP_NAME かつ Endpoint URL の両方が完全一致する既存専用 LIFF が存在 ➔ ID を検証・取得
       - 未存在 ➔ フォームを自律入力して新規作成（Full / profile, openid / 友だち追加 Off）➔ 新 LIFF ID を取得
     - コピー元・他地区 LIFF ID の転用は絶対禁止（不一致・正規フォーマットを検証）。
     - 取得した `productionLiffUrl` を `deployment.json` へ自動反映。
  6. `npm run sync:config` ➔ `npm run check:ssot` を実行し、`data/config.js` を SSOT 一方向同期。
  7. **【項目③】Google Maps APIキー自動設定 ＆ 未設定時 HARD STOP**:
     - 実行環境側の共通秘密情報 `POSTING_MAP_GOOGLE_MAPS_API_KEY` をプロビジョニング時に GAS Script Properties へ自動投入。
     - キーが未設定の場合は即座に **HARD STOP (exit 1)**。キー値そのものはログ・Git・報告書に絶対に出力せず、`GOOGLE_MAPS_API_KEY: PRESENT` のみ記録する。
  8. **【項目②】Spreadsheet DB（原本・当月シート）行順の即時完全同期**:
     - `npm run provision:district -- --reset-existing-records` を実行し、確定した `data/address_master.csv` の行順（五十音順SSOT）をスプレッドシートの「配布実績の原本」および当月業務シート「配布実績YYYY-MM」へ 100% 同期する。
     - A列ID・C列町域の全行順序が CSV と完全一致すること。新地区製造時のテストデータは `--reset-existing-records` で全リセットされ、クリーン初期化（進捗率0.0%）される。
     - 人間確認用 `SYSTEM_INFO` シートへの実環境情報同期を含む。
  9. **シート集合検証**: 実スプレッドシートのシート集合が、[`active/business/system/district_provisioner.js`](active/business/system/district_provisioner.js) の定義する **SSOT期待シート集合（`allSheets` = `SYSTEM_INFO` + 原本5種 + 月次5種）** と Set 完全一致することを検証（固定値「12」による判定を禁止）。
  10. ルートに `CNAME` ファイルを配備してプッシュし、GitHub Pages API（`gh api`）でカスタムドメイン登録および HTTPS 強制化（`https_enforced: true`）を設定。
  11. DNS伝播・Let's Encrypt 証明書発行をポーリング待機し、`curl -ILs "https://${domain}/"` で HTTP 200 OK 疎通を確認。
- **PASS条件**: インフラ全リソース配備完了（新地区専用LIFF ID確定・コピー元残骸ゼロ含む） ＆ Maps APIキー PRESENT ＆ 原本/当月シート行順 100% 完全同期 ＆ シート集合 SSOT 完全一致 ＆ 本番ドメイン HTTP 200 OK 疎通。
- **HARD STOP条件**: Google Maps APIキー未設定、原本/当月シート行順不一致、またはシート集合不一致検知時は即時 **HARD STOP (exit 1)**。
- **REJECT時**: State 4 先頭へ戻り、失敗したリソースの再生成・再デプロイ・反映待機を実施（データ層は保全）。

---

### State 5: RUNTIME_AUDIT（本番稼働E2E 5重検証）
- **担当**: Deployer ➔ Auditor
- **Action**:
  以下の **5重の本番稼働検証** を実機ブラウザ・API経由で執行する：
  1. **【項目⑤】Hアプリ本番URL・Google Maps実描画E2E検証**:
     - `https://${domain}/` へアクセス。
     - 単なる HTTP 200 応答ではなく、実機ブラウザで以下を厳格にアサート：
       - `window.google.maps` SDK ロード完了
       - 地図コンテナ内に `#main-map .gm-style` が実描画されていること
       - 地図コンテナのレンダリングサイズ（width > 0 && height > 0）が非ゼロであること
       - 実際に地図のズーム・ドラッグ・ピン操作が可能であること
       - LINE/LIFF 起動、認証、GPS記録、写真アップロード、配布完了フローが Console/Network エラー 0 件で動作すること。
  2. **Dashboard PC本番URL検証**:
     - `https://${domain}/active/manager/` へ PC 解像度でアクセス。
     - Manager パスワード認証、全ピン描画（件数 == 住所マスター行数）、町名セレクターが五十音順に整列、API 疎通、集計表示を確認。
  3. **Dashboard Mobile検証**:
     - モバイル viewport（iPhone 14相当: 390x844）でアクセス。
     - 横スクロール発生なし（`hasNoHorizontalScroll`）、UI重なりなし、町名セレクター開閉・ズーム・操作がレスポンシブに機能すること。
  4. **【項目③】本番GAS疎通・APIキー検証**:
     - `npm run verify:gas` を実行し、本番 WebApp URL の HTTP 200 応答および `getMapsApiKey` による `GOOGLE_MAPS_API_KEY: PRESENT` を確認。キー未設定（`MISSING`）の場合は即時 FAIL。
  5. **【項目②】本番スプレッドシートDB行順・初期状態検証**:
     - `npm run check:provisioning` を実行し、全原本0件、進捗率0.0%、ノイズ残骸ゼロを確認。
     - 「配布実績の原本」および「配布実績YYYY-MM」の行順が、`data/address_master.csv` の行順と 100% 一致（全件完全一致）していることを検証。
- **PASS条件**: 5項目すべてが ALL PASS であること（Google Maps が実描画されない限り、またはDB行順が一致しない限り完成扱いにしない）。
- **HARD STOP条件**: Google Maps が実描画されない（`.gm-style` 不在、コンテナサイズ 0）、またはAPIキー MISSING、DB行順不一致の場合は即時 **HARD STOP (FAIL)**。
- **REJECT時**:
  - 画面・CSS・レイアウト不具合 ➔ State 5 内部修正・再検証
  - API・インフラ・通信障害 ➔ State 4（インフラ再同期・再デプロイ）へ戻る
  - データ欠損・ピン数不一致・行順不一致 ➔ State 2（データ層再生成）へ戻る

---

## 🔒 完了・引渡フェーズの責任分離規程

State 5 の 5 重検証が ALL PASS となった後、以下の責任分離に従って安全に納品を完了する：

```text
［State 5 ALL PASS］
       ↓
［1. Report Truth Gate（完了報告値の実ファイル機械取得・突合）］
  ・担当: Flash（統括AI）
  ・記憶や過去ログからの数値記述を絶対禁止。
  ・その時点の実ファイル（data/address_master.csv等）を直接読み込み、
    先頭行ID/町名、末尾行ID/町名、総件数、合計人口、世帯数等の数値を機械抽出。
  ・報告書記載値と実ファイル抽出値の完全一致をアサート。
       ↓ PASS
［2. Auditor 独立査読］
  ・担当: Auditor（完全 READ ONLY）
  ・5観点（①地区非依存、②スコープ厳守、③客観的エビデンス、④コピー耐性、⑤公式データ確定）の独立判定を下す。
  ・すべての品質ゲートログおよび本番稼働エビデンスを照合し、PASS を宣言。
       ↓ PASS
［3. 成果物 Commit & Push］
  ・担当: Flash または Deployer
  ・確定した新地区成果物（data/, config, deployment等）をステージング。
  ・git commit -m "feat(<district>): complete autonomous district establishment"
  ・git push origin main
       ↓
［4. DELIVERY（完成納品）］
  ・MASTERへ以下の全稼働URL一覧および実ファイルから抽出した確定値を提示して完了報告：
    - Hアプリ本番URL（LINE LIFF URL）
    - Dashboard PC本番URL
    - Dashboard Mobile本番URL
    - 本番GoogleスプレッドシートURL
```

---

## 🔄 State 0〜5 判定 ＆ ロールバック対応表

| State | フェーズ名 | 担当 | 完了判定（PASS条件） | REJECT時の戻り先・挙動 |
| :---: | :--- | :--- | :--- | :--- |
| **0** | **SOURCE_VERIFY** | Auditor | `git status` clean ＆ `npm run check:purity` ALL PASS | **HARD STOP**（親機の汚染・未コミット変更解消まで中断・MASTER報告） |
| **1** | **REPLICA_INIT_AND_GIT_ISOLATION** | Deployer | 新フォルダー作成 ＆ `gh repo create` ＆ 初回push ＆ 旧origin切断確認 | **State 1 先頭**（フォルダー再作成・Git再接続） |
| **2** | **DATA_RESOLVE_AND_AUDIT** | Deployer ➔ Auditor | `validate-district-data-gate` ALL PASS（五十音順・小選挙区自治体純度含む） ＆ Auditor 承認 | **State 2 先頭**（パラメータ再調整・データ再生成）。Gitリポジトリは維持 |
| **3** | **SYS_INFO_DERIVATION** | Deployer | ドメインから CNAME、各URL、districtCode、resourceSpecs が矛盾なく確定 | **State 3 先頭**（内部再導出。MASTERへは聞き返さない） |
| **4** | **INFRA_PROVISIONING** | Deployer | スプレッドシート複製 ＆ Drive写真フォルダ生成 ＆ GAS deploy ＆ Maps APIキー投入（PRESENT） ＆ 原本/当月シート行順同期 ＆ SSOT期待シート集合構築 ＆ Pages CNAME設定 ＆ HTTPS疎通（HTTP 200） | **State 4 先頭**（失敗した外部リソースの再生成・再デプロイ・反映待機）。データ層は保全 |
| **5** | **RUNTIME_AUDIT** | Deployer ➔ Auditor | 5重検証（Hアプリ実描画、Dashboard PC、Dashboard Mobile、本番GAS Mapsキー、本番DB行順）ALL PASS ＆ Auditor承認 | ・画面・CSS崩れ ➔ **State 5 内部修正**<br>・API・インフラ障害 ➔ **State 4 へ戻る**<br>・データ・ピン不一致・行順不一致 ➔ **State 2 へ戻る** |
| **引渡** | **REPORT_TRUTH_GATE** | Flash ➔ Auditor | 報告書記載値と実ファイル直接抽出値の 100% 完全一致 ＆ Auditor 独立査読 PASS | **HARD STOP**（記載値に推測・乖離がある場合は報告提出を物理禁止） |

