---
name: development
description: 開発・完了報告手順 (9-Stage Protocol)。Stage 1 調査・Knowledge Impact Analysis から MASTER 承認、Scope Lock、実装、自己検証、Handover、MASTER新規会話監査、Commit/Push、Remote Sync、Stage 9 残骸監査ゲートまでの全行程を規定。
---

# Workflow: Development (開発・完了報告フロー)

AI社員の作業は、必ず以下の「9-Stage Execution Protocol」と「Verification Gate」に従う。この順序の省略・逆転・自己判断による短縮は絶対禁止とする。

---

## 9-Stage Execution Protocol (正式開発フロー)
※ AI役職定義およびツール統制の詳細は Canonical SSOT である [docs/ai-foundation.md](../../../docs/ai-foundation.md) を参照すること。

### Stage 1: Plan (調査・計画策定 & Knowledge Impact Analysis) — [主担当: Execution AI]
- READ ONLYで対象範囲と既存実装を調査（ファイル改変禁止）。
- **Knowledge Impact Analysis**: 変更予定の Canonical Source が `.agents/os-registry.json` のどの Capability Pack に影響するかを事前に特定・宣言。
- Scope（変更対象ファイル）を最小限に確定する（全域ホワイトリスト運用の絶対禁止）。
- チャット画面上で実装計画・完了条件・Verification Plan を提示（`implementation_plan.md` 等のリポジトリ内ファイル生成は禁止）。
- **🛑 HARD STOP**: 実装計画提示後、直ちに作業を停止し MASTER の着手承認（Proceed）を待つ。

### Stage 2: Approve & Scope Lock (MASTER承認 & 事前Scope固定)
- MASTERから明示的な着手承認（`Proceed`）を受領する（取得前の実装・コミット等は絶対禁止）。
- **事前Scope固定**: Proceed受領後、コード変更前に `.agents/current-scope.json` にMASTER承認Scope全体（文字列配列: `string[]`）を記録・固定する（既存 `scripts/check-scope.mjs` との完全互換を維持）。
- `node scripts/check-scope.mjs --scope-only` を通過後、**単独ローカルコミット** を行う。

### Stage 3: Implement (承認Scope内最小侵襲実装・並列ディスパッチ) — [主担当: Execution AI / Parallel Workers]
- 承認されたScope内のみを変更。Scope外変更、仕様の勝手な追加・変更は絶対禁止。
- **並列ディスパッチ時**:
  - 親Executionが `invoke_subagent` により各Workerへ排他的単一ファイルのみを割り当てて起動。指示プロンプトで参照すべき Capability Pack を明示指定。
  - 各Workerは割当ファイルのみを変更し、親指定の固定単体テストを実行後、`send_message` で `[WORKER REPORT]` を親へ返却。
  - **異常検知時の停止制御 & MASTER承認復旧プロトコル（MASTER条件反映）**:
    - エラー・テスト失敗・未承認差分を検知した場合、新規ディスパッチ・編集を即時停止し、登録済み親から実行中Workerに対して `manage_subagents(Action: "kill" / "kill_all")` による停止を要求・確認する（Workerからの停止・再委任は拒否）。停止失敗または未確認の場合はそのまま報告して **HARD STOP** とする（ロック中も親によるkill操作および非書込み Exact Match 監査読取りコマンド `--check-only` は妨げられない。AIによる自己解除・自動再開禁止）。
    - **復旧プロトコル（Recovery Protocol）**: 復旧は **「MASTERが承認し、AIが限定された復旧を実行する」** 構造を厳格に前提とする。登録済み親による固定された改名元・改名先への証跡保存（`mv -n .agents/.safety-lock .agents/.safety-lock.evidence-<timestamp>`）のみを `force_ask` 承認プロンプトの対象とし、既存証跡の上書きは機械的に拒否する。承認取消時はロックを保持する。復旧実行後は元の `.safety-lock` 不在および退避先証跡内容を確認し、静止状態（Working Tree の不変性）を確認して一括報告し HARD STOP とする（追加開発・Worker新規起動・Commit/Push/Deployは停止継続）。
- **指示外変更の即時停止（発見 ➔ 報告 ➔ STOP）**: 作業中に別機能や他ファイルの改善点・問題を発見した場合、勝手に修正コードを追加してはならない。
- **失敗時の自己拡張禁止**: テスト失敗時に自己判断でScope外ファイルへ修正を拡大してはならない。Scope外が必要な場合は作業をSTOPして追加指示を仰ぐ。

### Stage 4: Self Verify & Handover (自己検証 & ハンドオーバー) — [主担当: Execution AI]
- **Stage 4A: Execution Self Verify & Mechanical Governance Gate**:
  - V1 Static Verification: `git diff`, `git diff --check`, Scope確認, Dead Code確認。
  - V2 Runtime Verification: 実機起動、DOM/Console/Network、Google Maps 実描画確認（`.gm-style`）。
  - V3 Regression Verification: 全テストスイート実行（`npm test`、並列統合テスト）。
  - Mechanical Governance Gate: `node scripts/check-scope.mjs`（Scope Guard & Architecture Guard 通過必須）。
  - 統合差分固定（Freeze）: 検証完了状態のWorking Treeを静止させ、ハンドオーバー準備を行う。
- **Stage 4B: Handover & HARD STOP**:
  - 窓口AI（Execution AI）は統合自己検証完了後、リポジトリにファイルを生成せず、チャット画面に `[EXECUTION HANDOVER]`（要件・実差分・検証証跡）を提示し、直ちに作業を **🛑 HARD STOP（完全停止）** する（Auditor を自律起動しない）。

### Stage 5: Independent Audit in NEW Conversation (独立検品) — [主担当: MASTER / Independent Auditor AI]
- MASTER が自ら新規 Conversation（Context Isolation: 過去ログ遮断）を作成し、Independent Auditor AI を起動。
- 監査AIは Execution の報告を鵜呑みにせず、リポジトリ実物から allowlist コマンドを実行して独立再検証。
- 5大固定観点（最上位原則、Scope厳守、No Evidence No PASS、Zero Avoidable Manual、公式データゲート）で冷徹査読。
- 監査AIは `[AUDITOR VERDICT]` をチャット画面に出力（PASS または REJECT + 指摘事項）し、直ちに作業を完全停止する（Policy-Level Zero Write、リポジトリへのファイル書込・コミット厳禁）。

### Stage 6: Commit Gate (MASTER Resume 執行関門) — [主担当: Execution AI]
- **Commit 条件**:
  1. Independent Auditor AI によるチャット上の **PASS** 判定
  2. MASTER による PASS 目視確認および明示的な **Resume / Commit Proceed** 発令
  ※上記 **両方が揃った場合のみ**、Execution AI は作業を再開し `git commit` を執行する。Auditor PASS のみによる自律コミット再開は廃止・禁止。

### Stage 7: Push Gate (自律プッシュ) — [主担当: Execution AI]
- Stage 6 の MASTER Resume を受けた同一 Execution session において、Commit存在確認、Scope確認を完了後、Execution AI は `git push` を執行する（Stage 2 の Scope Commit を含めて一括プッシュ）。

### Stage 8: Deployment Gate & Remote Sync Verification — [主担当: Execution AI]
- Push完了後、実稼働環境への反映が必要な変更（Deployment対象変更）である場合のみ、独立工程として実際の稼働環境へのデプロイを実施する。
- 実環境への反映を必要としない変更（ドキュメント、テスト、設定のみ等）は **「Deployment対象外 (N/A)」** と明示的に判定・記録すること。
- Remote Sync 確認（HEAD == origin/main, clean working tree）を行い、実機確認へ移行する。
- 実機確認が PASS 完了した時点で、直ちに **Stage 9** へ移行する（Stage 9 の省略・自己判断による終了は絶対禁止）。

### Stage 9: Post-Verification Residual Cleanup (実機PASS後 残骸監査・機械検証可能証跡ゲート) — [主担当: Cleanup Worker (Residual Cleanup Auditor Profile) & Execution AI]
- **起動条件**: Stage 8 の実稼働・実機確認（実機動作確認）が PASS 完了した直後に、親Executionが必ず Cleanup Worker を起動する（**全Missionで必須執行。Stage 9 N/A は全面禁止**）。
- **入力情報**: 親Executionより確定差分（`BASE_COMMIT` ➔ `HEAD_COMMIT`）、`MISSION_SCOPE`、`APPROVED_DIFF`、実機PASS証跡を受領。
- **起動プロンプト要件 (Three-Way Exact Match)**:
  - 親Executionは `invoke_subagent` のプロンプト（Event A）に `BASE_COMMIT`、`HEAD_COMMIT`、`APPROVED_DIFF` を完全一致で明示指定すること。
- **監査行動規範 (Policy-Level ZERO WRITE)**:
  - 書込ツール（`write_to_file`, `replace_file_content`）はWorkerに物理提供されているが、本工程での使用を禁止する（Policy-Level Zero Write）。
  - `run_command` は使用禁止とする（テスト再実行・任意コマンド禁止）。
  - 監査ツールは `view_file`, `grep_search`, `list_dir` に限定し、確定差分に起因する残骸（7類型）のcall-siteを静的に精査する。
  - 能動的なScope外探索は禁止。監査過程で偶発的に発見された不要コードは `OUT-OF-SCOPE Finding` として報告のみ行う。
  - 自律削除は絶対禁止とする。
- **報告と判定フロー**:
  1. Cleanup Worker はチャット画面（親Execution宛て）に `[CLEANUP REPORT]`（`DELETE-CANDIDATE`, `KEEP`, `OUT-OF-SCOPE`）を出力し、待機状態に入る。
  2. 親Executionは、機械検証可能証跡ゲート（Machine-verifiable Evidence Gate）を実行する：
     ```bash
     npm run gate:cleanup -- --base <BASE_COMMIT> --target <HEAD_COMMIT>
     ```
     - Gate は現在Conversationの transcript から Event A（`invoke_subagent`）➔ Event B（tool_result with `conversationId`）➔ Event C（childからの `[CLEANUP REPORT]`）の構造化相関チェーン、イベント順序（`stepA < stepB < stepC`）、および三者完全一致（Event A == CLI args == Event C report）を厳格に機械検証する。
     - Fail-Closed: ログパス欠損・環境変数欠損・ファイル不存在・JSONLパースエラーは即時失敗（exit 1）とする。
     - Stale成功チェーンへのfallbackは禁止（最新チェーンのみ評価）。
  3. **残骸解消の累積サイクル (Cumulative Re-audit)**:
     - `DELETE-CANDIDATE` が0件（`Overall Verdict: NO_CLEANUP_NEEDED`）かつ `gate:cleanup` が Exit 0 で通過した場合に限り、親Executionは `[MISSION COMPLETION REPORT]` を提出し Mission CLOSED を宣言できる。
     - `DELETE-CANDIDATE` が存在（> 0）し MASTER が削除を承認した場合、削除実装との物理的分離原則に従い以下の独立Cleanupサイクルを実行する：
       - Stage 2: `Cleanup Scope Commit`（MASTER承認の削除対象ファイルのみを `.agents/current-scope.json` に設定・単独コミット）
       - Stage 3: 通常の `Implementation Worker`（動作モード1）による残骸コードの最小削除
       - Stage 4: `Self Verify`（`npm test` 全回帰テスト PASS、`check-scope.mjs` 通過）
       - Stage 5: `Independent Auditor AI` による削除適正性の独立再検品
       - Stage 6/7: `Commit & Push`
       - **累積再監査の義務**: 削除コミット完了後、必ず `ORIGINAL_BASE ➔ latest TARGET` の全累積差分に対して Stage 9（Cleanup Worker 起動 ➔ `[CLEANUP REPORT]` ➔ `gate:cleanup` PASS）を再実行する。最終的に `DELETE-CANDIDATE: 0 / NO_CLEANUP_NEEDED` を得るまで Mission CLOSED とすることはできない。

### Rollback ガバナンス規程 (History-Preserving Rollback Protocol)
万一、本番・検証・運用のいずれかで重大な障害が発生しロールバックが必要となった場合、履歴保持型revertのみを許可する。

1. **ロールバック実行手順 (明示的逆順 revert)**:
   - Step 1: `git revert --no-edit <C_impl>` （実装コミットの明示的反転）
   - Step 2: `git revert --no-edit <C_scope>` （Scope コミットの明示的反転）
   ※ Implementation Commit ➔ Scope Commit の明示的逆順で1コミットずつ確実にrevertする。曖昧な commit range revert は禁止。

2. **履歴破壊型操作の絶対禁止**:
   - `git reset --hard`
   - `git reset --mixed`
   - `git reset --soft`
   - `git push --force`
   - `git push --force-with-lease`
   - その他履歴破壊型rollback（`rebase`, `commit --amend` 等の既出コミット改変）は永久に禁止する。

---

## 完了報告の禁止事項

以下の状態で「完了報告」（Mission CLOSED / 完全終了 / 全工程完了 / Release Complete / 最終PASS等）として提出することは絶対禁止とする：
- 「あとでcommitします」「あとでpushします」という状態。
- 「ユーザーに実機確認してもらう」「検証は別途行う」状態。
- 「問題ないと思われる」「コード上は正しいはず」という推測状態。
- 報告時点で未解決のエラーが存在する状態。
- Stage 8 実機PASS後に Stage 9 Cleanup Worker（Residual Cleanup Auditor Profile）を起動していない状態。
- Cleanup Worker からの正式な `[CLEANUP REPORT]` を受領していない状態。
- `npm run gate:cleanup -- --base <BASE> --target <TARGET>` による機械検証（Exit 0）を通過していない状態。
- `DELETE-CANDIDATE > 0` の残骸候補が存在したまま、または削除サイクル後の累積全差分に対する再Stage 9監査を完了していない状態。
