# Workflow: Development (開発・完了報告フロー)

AI社員の作業は、必ず以下の「8-Stage Execution Protocol」と「Verification Gate」に従う。この順序の省略・逆転・自己判断による短縮は絶対禁止とする。

---

## 8-Stage Execution Protocol (正式開発フロー)
※ AI役職定義およびツール統制の詳細は Canonical SSOT である [docs/ai-foundation.md](../../../docs/ai-foundation.md) を参照すること。

### Stage 1: Plan (調査・計画策定) — [主担当: Execution AI]
- READ ONLYで対象範囲と既存実装を調査（ファイル改変禁止）。
- Scope（変更対象ファイル）を最小限に確定する（全域ホワイトリスト運用の絶対禁止）。
- 実装計画（`implementation_plan.md` 等）を作成し、完了条件および Verification Plan を定義して提示。
- **🛑 HARD STOP**: 実装計画提出後、直ちに作業を停止し MASTER へ提示する。

### Stage 2: Approve & Scope Lock (MASTER承認 & 事前Scope固定)
- MASTERから明示的な着手承認（`Proceed`）を受領する（取得前の実装・コミット等は絶対禁止）。
- **事前Scope固定**: Proceed受領後、コード変更前に `.agents/current-scope.json` にMASTER承認Scope全体（文字列配列: `string[]`）を記録・固定する（既存 `scripts/check-scope.mjs` との完全互換を維持）。
- （通常タスク時）`node scripts/check-scope.mjs --scope-only` を通過後、**単独ローカルコミット** を行う（※並列試験時等、MASTERから指示がある場合は固定のみ行い単独コミットをスキップ可能）。

### Stage 3: Implement (承認Scope内最小侵襲実装・並列ディスパッチ) — [主担当: Execution AI / Parallel Workers]
- 承認されたScope内のみを変更。Scope外変更、仕様の勝手な追加・変更は絶対禁止。
- **並列ディスパッチ時**:
  - 親Flashが `invoke_subagent` により各Workerへ排他的単一ファイルのみを割り当てて起動。
  - 各Workerは割当ファイルのみを変更し、親指定の固定単体テストを実行後、`send_message` で `[WORKER REPORT]` を親へ返却。
  - **異常検知時の停止制御 & MASTER承認復旧プロトコル（MASTER条件反映）**:
    - エラー・テスト失敗・未承認差分を検知した場合、新規ディスパッチ・編集を即時停止し、登録済み親から実行中Workerに対して `manage_subagents(Action: "kill" / "kill_all")` による停止を要求・確認する（Workerからの停止・再委任は拒否）。停止失敗または未確認の場合はそのまま報告して **HARD STOP** とする（ロック中も親によるkill操作および非書込み Exact Match 監査読取りコマンド `--check-only` は妨げられない。AIによる自己解除・自動再開禁止）。
    - **復旧プロトコル（Recovery Protocol）**: 復旧は **「MASTERが承認し、AIが限定された復旧を実行する」** 構造を厳格に前提とする。登録済み親による固定された改名元・改名先への証跡保存（`mv -n .agents/.safety-lock .agents/.safety-lock.evidence-<timestamp>`）のみを `force_ask` 承認プロンプトの対象とし、既存証跡の上書きは機械的に拒否する。承認取消時はロックを保持する。復旧実行後は元の `.safety-lock` 不在および退避先証跡内容を確認し、静止状態（Working Tree の不変性）を確認して一括報告し HARD STOP とする（追加開発・Worker新規起動・Commit/Push/Deployは停止継続）。
- **指示外変更の即時停止（発見 ➔ 報告 ➔ STOP）**: 作業中に別機能や他ファイルの改善点・問題を発見した場合、勝手に修正コードを追加してはならない。
- **失敗時の自己拡張禁止**: テスト失敗時に自己判断でScope外ファイルへ修正を拡大してはならない。Scope外が必要な場合は作業をSTOPして追加指示を仰ぐ。

### Stage 4: Self Verify & Independent Audit (自己検証 & 独立検品) — [主担当: Execution AI / MASTER / Auditor AI]
- **Stage 4A: Execution Self Verify & Mechanical Governance Gate**:
  - V1 Static Verification: `git diff`, `git diff --check`, Scope確認, Dead Code確認。
  - V2 Runtime Verification: 実機起動、DOM/Console/Network、Google Maps 実描画確認（`.gm-style`）。
  - V3 Regression Verification: 全テストスイート実行（`npm test`、並列統合テスト）。
  - Mechanical Governance Gate: `npm run audit:gate`（Scope Guard通過、既存ゲートとして完全維持・必須）。
  - 統合差分固定（Freeze）: 検証完了状態のWorking Treeを静止させ、ハンドオーバー準備を行う。
- **Stage 4B: Context-Isolated Audit Delegation (文脈分離査読依頼)**:
  - 窓口AI（Execution AI）は統合自己検証完了後、リポジトリにファイルを生成せず、実装担当とは分離された文脈（Context Isolation）で別の監査AIへ `[EXECUTION HANDOVER]`（要件・実差分・検証証跡）を渡して査読を依頼する。
- **Stage 4C: Independent Audit Execution (監査AI独立再検証)**:
  - 監査AIは分離された文脈で依頼を受領し、Execution の記述を鵜呑みにせず、自ら独立検証コマンド（`git status`, `git diff`, `npm test`, 監査スクリプト等）を実行。
  - 5大固定観点（最上位原則、Scope厳守、No Evidence No PASS、Zero Avoidable Manual、公式データゲート）で冷徹査読。
- **Stage 4D: Auditor Verdict & HARD STOP**:
  - 監査AIは `[AUDITOR VERDICT]` を出力（PASS または REJECT + 指摘事項）し、直ちに作業を完全停止する（リポジトリへのファイル書込・コミットは厳禁）。
  - 窓口AIは監査判定および客観的証跡を集約してチャット画面で MASTER に提示し、**🛑 HARD STOP（完全停止）** して MASTER による明示的な Commit Proceed（最終コミット承認）を待つ。

### Stage 5: Commit Gate (MASTER Resume 執行関門) — [主担当: Execution AI]
- **Commit 条件**:
  1. Independent Auditor AI によるチャット上の **PASS** 判定
  2. MASTER による PASS 目視確認および明示的な **Resume / Commit Proceed** 発令
  ※上記 **両方が揃った場合のみ**、Execution AI は作業を再開し `git commit` を執行する。Auditor PASS のみによる自律コミット再開は廃止・禁止。

### Stage 6: Push Gate (自律プッシュ) — [主担当: Execution AI]
- Stage 5 の MASTER Resume を受けた同一 Execution session において、Commit存在確認、Scope確認を完了後、Execution AI は `git push` を執行する（Stage 2 の Scope Commit を含めて一括プッシュ）。

### Stage 7: Crisp Deployment Gate — [主担当: Execution AI]
- Push完了後、実稼働環境への反映が必要な変更（Deployment対象変更）である場合のみ、独立工程として実際の稼働環境へのデプロイを実施する。
- 実環境への反映を必要としない変更（ドキュメント、テスト、設定のみ等）は **「Deployment対象外 (N/A)」** と明示的に判定・記録すること。

### Stage 8: V4 Deployment Verification & Completion — [主担当: Execution AI]
- **V4成立条件**: Deployment対象なら「実環境で反映を確認した客観的Evidence」、Deployment非対象なら「対象外 (N/A) であることの客観的確認Evidence」を取得し、そのEvidenceをもってV4 PASSとする。
- **Report Truth Gate**: 完了報告書の数値を実ファイルから直接機械抽出し、1文字の狂いもないことを照合。
- V4 PASS後にのみ、最終的なGit確認（HEAD一致、working tree clean）と完了報告（Completion Report）を行える。

---

## 完了報告の禁止事項

以下の状態で「完了報告」として提出することは絶対禁止とする：
- 「あとでcommitします」「あとでpushします」という状態。
- 「ユーザーに実機確認してもらう」「検証は別途行う」状態。
- 「問題ないと思われる」「コード上は正しいはず」という推測状態。
- 報告時点で未解決のエラーが存在する状態。
