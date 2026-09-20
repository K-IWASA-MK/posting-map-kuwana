# POSTING MAP 量産・新地区完全自律展開手順書 (COPY RUNBOOK)

本ドキュメントは、完成版POSTING MAPリポジトリから新しい地区（`<TARGET_DISTRICT_CODE>`）を複製し、独立した本番システムとして完全稼働させるための**確定手順書（全6ステージ）**である。

---

## 🏛️ 最上位絶対原則

1. **ターゲット先行確定原則 (Target Definition First — ABSOLUTE)**:
   - 「地区コード」「選挙種別」「対象自治体コード」の3点が確定する前に、フォルダーの複製を開始してはならない。
2. **原本データ不可侵原則 (Source Data Protection — ABSOLUTE)**:
   - コピー元（原本）の本番Spreadsheet、Drive写真フォルダ、GAS本番環境は**完全保全**とする。
   - 量産のためにコピー元の本番DBを初期化・消去することは絶対禁止とする。新地区のスプレッドシートは新地区側で0件自動生成される。
3. **完全自律・ゼロ手作業原則 (Zero Manual Operation)**:
   - インフラ作成（Spreadsheet, Drive, LIFF）、データ生成、デプロイ、12シート構築はすべてAI社員が自律実行する。
   - 人間（MASTER）の介入は「起動指示」および「Google初回OAuth同意（1クリック）」のみに限定する。

---

## 🧭 全体オーケストレーション経路

```
【Stage 0: ターゲット確定】 MASTERが3点情報（地区コード・選挙種別・自治体コード）を指示
    ↓
【Stage 1: コピー元原本の保全・クリーン確認】 原本を完全保全し、Git作業ツリーをクリーン凍結
    ↓
【Stage 2: 新地区フォルダーの物理複製 ＆ Git完全独立化】 cp -r 複製 ＆ 新リモートリポジトリ設定
    ↓
【Stage 3: 新地区インフラの自動生成】 Spreadsheet・Driveフォルダ・LINE LIFFを完全自動発行
    ↓
【Stage 4: 新地区データの調達・交換】 選挙種別粒度制御（地方選＝ミクロ） ＆ 過去3回選挙データ反映
    ↓
【Stage 5: 新地区GASデプロイ ＆ 12シート自動プロビジョニング】 clasp作成 ＆ 12シート自動構築
    ↓
【Stage 6: 全自動E2E検証 ＆ 独立検品 ＆ 納品】 check:provisioning ＆ E2E ＆ Auditor検品 ➔ 完了！
```

---

## 📋 各ステージの執行手順

### Stage 0: ターゲット確定 (Target Definition)
MASTERは以下の3点情報を確定し、新地区展開パイプラインを起動する：
- **① 新地区コード (District ID)**: （例: `MIE-KAMEYAMA`, `OKAYAMA-03` 等）
- **② 選挙種別**: `国政選挙` (衆院選・参院選) または `地方選挙` (県議選・市議選・首長選)
- **③ 対象自治体コード一覧**: （例: `24210: 三重県亀山市`）

---

### Stage 1: コピー元原本の純度確認 ＆ 凍結 (Source Purity Verification & Freeze)
1. **コピー元原本の純度判定 (Purity PASS)**:
   - コピー元には「コピーされてはいけないもの（実体設定・RAWデータ・作業残骸）」が一切存在しないことを機械判定する：
   ```bash
   npm run check:purity
   ```
   - 判定結果が **ALL PASS** であることを確認（`deployment.json`, `.clasp.json`, `CNAME`, `data/raw/` 排除済）。
2. **ワーキングツリーのクリーン確認**:
   - `git status` が `working tree clean` であることを確認し、原本状態を凍結。

---

### Stage 2: 新地区フォルダーの物理複製 ＆ Git完全独立化 (Physical Copy & Git Isolation)
1. **フォルダー複製**:
   ```bash
   cp -r posting-map-<SOURCE>/ posting-map-<TARGET_DISTRICT_CODE>/
   cd posting-map-<TARGET_DISTRICT_CODE>/
   ```
2. **Gitリモートの切り離し（誤爆物理遮断）**:
   新地区用の空リポジトリ（GitHub等）を作成し、リモートURLを差し替える：
   ```bash
   git remote set-url origin https://github.com/<ORG>/posting-map-<TARGET_DISTRICT_CODE>.git
   ```
   > 🛑 **AGENTS.md 第2条**: 別地区リポジトリ間でのPull/Push/Merge・ブランチ共有は絶対厳禁。

---

### Stage 3: 新地区インフラの自動生成 (Infrastructure Auto-Provisioning)
AI社員がAPIおよび自動化スクリプトを用いて、新地区専用の外部リソースを自動生成する：
1. **新規Googleスプレッドシート（完全空）の自動作成**:
   - Google Drive APIを使用し、ファイル名を新地区コード（例: `MIE-KAMEYAMA`）として新規作成し、`spreadsheetId` を取得。
2. **写真保存用Google Driveフォルダの自動作成**:
   - `<TARGET_DISTRICT_CODE>_PHOTOS` フォルダを作成し、`storageFolderId` を取得。
3. **LINE LIFF アプリの自動発行**:
   - LINE LIFF API またはブラウザ自動化経由で、`POSTING MAP Login` チャネル配下に新地区用LIFFアプリを自動発行し、`productionLiffUrl` を取得。
4. **`deployment.json` の自動更新**:
   - 取得したリソースID群を一括書き込み。

---

### Stage 4: 新地区データの調達・交換 (Data Transition & Election History)
1. **選挙種別によるマップ粒度の適用**:
   - **国政選挙モード**: 広域オペレーション向け標準小地域（町丁・大字）単位。
   - **地方選挙モード**: 市・区・町内の狭域高密度オペレーションのため、親大字への集約を排除し、**e-Stat小地域（KEY_CODE単位完全網羅）の高精細ミクロ粒度**を採用。
2. **マスター3点セットの自動生成**:
   - `python3 scripts/generate-boundaries-geojson.py --city-codes "<自治体コード:自治体名>"` を実行し、`address_master.csv`, `boundaries.geojson`, `municipality_master.csv` を生成。
3. **過去3回の選挙データの調達・反映**:
   - 総務省および各自治体選挙管理委員会の公式確定データに基づき、対象地区の**直近過去3回の選挙結果（投票率等）**を [data/election_history.json](data/election_history.json) へ正確に投入。
4. **エリアマッピング初期化**:
   - `data/area_mapping.json` を空配列 `[]` に初期化。
5. **保管場所候補マスター（保有チラシ市町村データ）の機械的導出・配備**:
   - **生成思想**: 前地区からの流用・推測・静的コピーを完全排除し、新地区の「選挙開催地（対象自治体）」を入力条件として、公的・公式な衆議院小選挙区データに基づき機械的に導出する。
   - **導出手順**:
     1. 選挙開催地（対象自治体）から、該当する「都道府県・第○区」を公式小選挙区画定データに基づき特定。
     2. 当該小選挙区に属する全構成市町村名（活動・保管拠点候補）を取得。
     3. 新地区の `data/storage_locations.json` に文字列配列（例: `["市町村A", "市町村B", ...]`）として配備。必須の地区データファイルとして配備を完了する。
6. **データ品質ゲート自動判定**:
   - `node scripts/validate-district-data-gate.mjs` を実行し、全ゲート（件数整合、幾何有効性、Target District純度・storage_locations.json承認、前地区残骸ゼロ）の ALL PASS を確認。

---

### Stage 5: 新地区GASデプロイ ＆ 12シート自動プロビジョニング (GAS Deploy & Provisioning)
1. **Standalone GASプロジェクト自動作成**:
   - `clasp create --type standalone --title "<TARGET_DISTRICT_CODE> GAS"` を実行し、新プロジェクトIDを `deployment.json` へ設定。
2. **本番コードプッシュ ＆ Web Appデプロイ**:
   - `node scripts/safe-deploy.mjs` を実行し、コード反映とWeb App公開を実施。
3. **初回OAuth同意（人間によるワンクリック承認）**:
   - AIから提示されたWeb AppまたはエディタURLを開き、Googleアクセス権限を1回だけ承認。
4. **12シート完全自動プロビジョニング ＆ Maps APIキー自動設定**:
   - `npm run provision:district` を実行。
   - 実行環境側の共通秘密情報 `POSTING_MAP_GOOGLE_MAPS_API_KEY` から GAS Script Properties へ API キーを自動投入（未設定時は HARD STOP）。
   - 新規スプレッドシート上に、以下の**全12シート、数式、書式、マッピングが0件初期状態で自動構築**される：
     1. `SYSTEM_INFO`（保護台帳・進捗率0.0%）
     2. `配布実績の原本`
     3. `名簿の原本`
     4. `保有チラシ枚数の原本`
     5. `受渡要請履歴の原本`
     6. `PinStatusの原本`
     7. `配布実績YYYY-MM`
     8. `名簿YYYY-MM`
     9. `保有チラシ枚数YYYY-MM`
     10. `受渡要請履歴YYYY-MM`
     11. `PinStatusYYYY-MM`
     12. `ポスティング進捗状況`
5. **クライアント設定の一方向同期 ＆ 本番GAS疎通・APIキー検証**:
   - `npm run sync:config` ➔ `npm run check:ssot` を実行し、フロントエンド設定を同期。
   - `npm run verify:gas` を実行し、本番 WebApp の疎通および `GOOGLE_MAPS_API_KEY: PRESENT` を検証（空なら FAIL）。

---

### Stage 6: 全自動E2E検証 ＆ 独立検品 ＆ 納品 (E2E Verification & Completion)
1. **プロビジョニング完全性ゲート**:
   - `npm run check:provisioning` を実行し、12シート完全性、進捗率0.0%、件数整合を確認。
2. **Dashboard深層E2E ＆ HアプリGoogle Maps実描画テスト**:
   - `npm run test:dashboard:gate` を実行し、全6フェーズのブラウザ自動テストがPASSすることを確認。
   - Hアプリ本番E2Eにて、`window.google.maps` および `#main-map .gm-style` の実描画（非ゼロサイズ）を確認（地図実描画がない限り地区完成扱いにしない）。
3. **Auditor独立検品**:
   - `auditor` サブエージェントが「公式データ確定」「前地区残骸ゼロ」「権限境界」を独立査読し、PASS判定を受領。
4. **納品報告**:
   - Gitコミット ＆ プッシュを実施。
   - MASTERへ以下の稼働URL一覧を提示して完了：
     - スプレッドシートURL
     - Web App (API) URL
     - LINE LIFF URL
     - コックピット (Dashboard) URL
