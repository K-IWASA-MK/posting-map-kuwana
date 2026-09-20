# Verification Gates & Validation Principle (検証・検品規程)

AI社員の作業は、必ず以下の「Verification Gate」と「客観的証跡要件」に従う。この順序の省略・逆転・自己判断による短縮は絶対禁止とする。

---

## 1. Verification Levels (V1〜V4)

### V1 Static Verification
- `git diff`, `git diff --check`, Scope確認, 構文/Lint, Dead Code確認。

### V2 Runtime Verification
- 実際の環境/実機でのUI, Console, Network, API, 状態遷移, エラー等の確認。（静的確認のみでのPASS禁止）
- **Google Maps 実描画要件（【項目⑤】）**:
  - 地図機能を含む画面（Hアプリ・Manager）においては、単なる HTTP 200 応答や HTML DOM 到達のみでの PASS を絶対禁止とする。
  - 実機ブラウザで `window.google.maps` がロードされ、地図コンテナ内に `#main-map .gm-style` が実描画され、コンテナサイズが非ゼロ（width > 0 && height > 0）であり、ドラッグ・ズーム等の操作が可能であることを確認しなければならない。

### V3 Regression Verification
- 既存機能への副作用がないことの確認。

### Auditor Subagent Verification
- 独立検品サブエージェント（`.agents/agents/auditor/agent.md`）へ検品依頼パッケージを渡し、3観点でのPASS判定を取得する。

### Mechanical Governance Gate
- `npm run audit:gate` を実行し、Scope Guardおよび機械監査を通過する。

### Commit Gate & Push Gate
- **Commit Gate**: V1〜V3検証のPASS、Auditor SubagentのPASS、Mechanical Governance Gateの通過、Scope監査（Staged Diff）がすべて完了した場合のみCommitを許可。
- **Push Gate**: Commit存在確認、Scope確認、必要な自動監査（Governance Gate等）を通過した場合のみPushを許可。

### Crisp Deployment Gate & V4 Deployment Verification
- **Crisp Deployment Gate**: Push完了後、実稼働環境への反映が必要な変更（Deployment対象変更）である場合、独立工程として実際の稼働環境へのデプロイを実施する。実環境への反映を必要としない変更は「Deployment対象外」と明示的に判定・記録すること。対象外であることを根拠なく推測してはならない。
- **V4 Deployment Verification**:
  - **V4成立条件**: Deployment対象なら「実環境で反映を確認した客観的Evidence」、Deployment非対象なら「対象外であることの客観的確認Evidence」を取得し、いずれの場合もそのEvidenceをもってV4 PASSとする。
  - **重要**: `git status`、`git log`、`Script is already up to date.` 等のGit/Crisp実行結果だけでは、V4 Deployment VerificationのEvidenceとして扱わない。
  - **Evidence不足の場合**: PASSせず即時HARD STOPし、MASTERへ報告すること。Evidence不足を補うための実装・修正をAIが勝手に開始してはならない。
  - このV4をPASSした後にのみ、最終的なGit確認（HEAD一致、working tree clean）と完了報告（Completion Report）を行える。

### Report Truth Gate（完了報告値直接機械取得・突合関門）
- **義務**: 完了報告（Completion Report / `walkthrough.md` / チャット報告）を作成する際、AI社員が自身の記憶や過去のコンテキストから数値を記述することを絶対禁止とする。
- **Action**: その時点の実ファイル（`data/address_master.csv` 等）を直接コマンド（`head`, `tail`, `wc -l` 等）で機械抽出し、先頭行ID/町名、末尾行ID/町名、総件数、合計人口、世帯数、代表座標等の確定値を報告書に埋め込み、1文字の狂いもなく実ファイルと完全一致することを検証・提示する。
- **Hard Stop**: 報告書の記載値と実ファイル値に 1文字でも差異・推測・古い残骸がある場合は、報告提出を物理禁止し **HARD STOP** とする。

---

## 2. Verification Evidence Requirement (証跡5項目)

すべてのVerification（V1〜V4、および Report Truth Gate）において、以下の5項目を記録し証明しなければならない。
- **Test**: 何を確認するか
- **Expected**: 期待される結果
- **Actual**: 実際の実行結果
- **Evidence**: 取得した証跡（Consoleログ、Networkレスポンス、DOM要素など）
- **Judgment**: PASS / FAIL

---

## 3. PASSの厳格な定義

**PASS** とは「対象条件を実際に実行し、期待結果とActual結果を比較し、客観的Evidenceによって成功を確認した状態」のみを指す。
「問題なさそう」「おそらく動く」「ユーザーが確認すれば分かる」「後で確認する」等の**推測によるPASS判定は絶対禁止**とする。

---

## 4. 🛑 HARD STOP RULE / Validation Principle

**AI Agent must not report completion unless verification evidence exists.**

### 禁止事項
- 実行していない検証結果を書く
- 予定結果を書く
- 記憶や過去ログから推測で完了報告の数値を書く（Report Truth Gate違反）
- Google Maps の実描画（`.gm-style` / コンテナ非0サイズ）を確認せずにUI検証をPASSとする
- ユーザー確認待ち状態で完了報告する
- あとでcommitする、など未確定状態での報告
- 「スクリーンショットを要求する」「画面を想像する」「実機確認をユーザーに任せる」形での検証完了報告は絶対禁止とする。

### 客観的証跡の義務
AI社員自身がローカルで起動・操作し、DOM/Console/Networkなどの客観的証跡を取得しなければならない。

### 直ちに作業をSTOPする条件（Commit/Push/Deploy絶対禁止）
以下の場合は直ちに作業をSTOPし、勝手に解決策を作らず報告すること：
- 検証不能、実環境確認不能、必要Evidence取得不能な場合
- Console Error、Network/API Error、UI異常、Runtime異常が残存する場合
- Regression影響を否定できない場合
- Scope外の変更が必要になった場合
- Git状態が不明、Deployment結果・本番環境状態が不明な場合
- 仕様変更や権限越権が必要な場合、承認が必要な場合
- ユーザーへ実機検証を委任する必要がある場合
- AI自身が推測でPASS判定しようとする状態
- 既存アプリケーションへの影響が疑われる場合
- その他、AI社員自身で判断してはいけない事項が発生した場合
