# AI & Tooling Architecture — Canonical SSOT (AI社員基盤・正本仕様書)

本書は、POSTING MAP プロジェクトにおける **AI & Tooling Architecture の唯一の正本（Canonical SSOT）** である。  
本プロジェクトで稼働するすべての AI エージェント（Design / Direction AI、Execution AI、Independent Auditor AI、District Provisioning AI）は、本書に規定された Entry Point、Authority、Prohibited Actions、Required SSOT、Allowed Tools、Approval Boundary、Verification Responsibility、Handoff 仕様に従わなければならない。

---

## 0. 正本階層アーキテクチャと最高位原則ガバナンス (Supreme Principle Governance)

POSTING MAP AI Employee OS のすべての知識体系・工学契約・運用就業規則は、以下の厳格な4層正本階層に従属する。

```text
Level 0: 最高位存在規範・憲法 【Versioned SSOT】
  └─ docs/architecture/SUPREME_PRODUCT_PRINCIPLES.md
       │
       ▼
Level 1: 普遍工学・品質規格 (Engineering Specifications)
  ├─ docs/architecture/01_DESIGN_CONTRACT.md (最高位設計契約)
  ├─ docs/architecture/UNIVERSAL_QUALITY_DOCTRINE.md (普遍12大品質ドクトリン)
  └─ docs/api/API_CONTRACT.md (API境界契約)
       │
       ▼
Level 2: AI社員就業規則・組織統制 (Operational Governance)
  ├─ AGENTS.md (基本就業規則)
  ├─ docs/ai-foundation.md (AI社員正本仕様書)
  └─ .agents/rules/** (個別規程)
       │
       ▼
Level 3: 機能資質パック (Capability Packs)
  └─ .agents/skills/** (Behavior Preservation, H-App, Backend, etc.)
```

### 一方向原則解決規程 (Single-Direction Principle Resolution)
1. **最高位原則の不可侵性**: 全 AI 社員は、Level 0 の `SUPREME_PRODUCT_PRINCIPLES.md`（Product Behavior Preservation, Universal Product Model, One District Boundary, Current Tree = Current / Git History = Past, No Autonomous Principle Change, Governance）を絶対遵守する。
2. **Version Literal 非複製原則**: 各 Role 定義（`agent.md`）や Skill 定義（`SKILL.md`）へ原則バージョン文字列を直接ハードコードすることを禁止する（Drift 防止）。
3. **一方向解決チェーン**: 原則バージョンおよび有効状態の解決は、常に以下の単一経路によって行う：
   $$\text{Current Role} \longrightarrow \text{Canonical Pointer} \longrightarrow \text{.agents/os-registry.json} \longrightarrow \text{docs/architecture/SUPREME_PRODUCT_PRINCIPLES.md (Frontmatter)}$$

---

## 1. 組織体系と AI 役職定義 (Organizational Architecture)

POSTING MAP の開発・保守・展開は、厳格な関門分離（Separation of Concerns）と明確な運用規程（Role & Policy Enforcement）を備えた AI 役職体系によって執行される。
実装フェーズにおいては、Antigravity 2.0 Flash を「実装統括（Orchestrator）」とし、その配下で起動されるエージェントを「並列実装担当（Parallel Worker）」として階層分離する。

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MASTER (Human / Client)                                │
│          [要件定義 / Scope決定 / 着手承認(Proceed) / Commit・Push最終承認 / 紛争調停]    │
└────────┬───────────────────────────────┬───────────────────────────────┬───────────────┘
         │ 1. 構造設計 / Gap 検討指示     │ 2. 実装タスク指示              │ 3. 新地区展開指示 + 外部リソース
         ▼                               ▼                               ▼
┌──────────────────┐            ┌──────────────────┐            ┌────────────────────────┐
│ Design/Direction │            │   Execution AI   │            │  District Provisioning │
│        AI        │            │(Chief Orchestr.) │            │           AI           │
│ (Policy ZeroWrite│            │ (実装統括・親)   │            │ (data/展開・受入検証)  │
└────────┬─────────┘            └────────┬─────────┘            └───────────┬────────────┘
         │ Blueprint Handoff             │ 承認Scope割当 / ディスパッチ     │ Handover Package
         │ (MASTER Approved)             ▼                                  ▼
         │                      ┌──────────────────┐            ┌────────────────────────┐
         │                      │ Parallel Workers │            │       HARD STOP        │
         │                      │ (排他単一ファイル)│            └───────────┬────────────┘
         │                      └────────┬─────────┘                        │
         │                               │ [WORKER REPORT] (send_message)   │
         │                               ▼                                  │
         │                      ┌──────────────────┐                        │
         │                      │ 統合自己検証     │                        │
         │                      │ (V1-V3, Scope)   │                        │
         │                      └────────┬─────────┘                        │
         │                               │ [EXECUTION HANDOVER] (チャット出力)│
         │                               ▼                                  │
         │                      ┌──────────────────┐                        │
         │                      │    HARD STOP     │                        │
         │                      └────────┬─────────┘                        │
         │                               │                                  │
         │                               ▼                                  │
         │                     MASTER launches Auditor                      │
         │                       in NEW Conversation                        │
         │                               │                                  │
         │                               ▼                                  │
         │                      ┌──────────────────┐                        │
         │                      │ Independent      │◄───────────────────────┘
         │                      │ Auditor AI       │
         │                      │ (Policy ZeroWrite│
         │                      │  Context Isolate)│
         │                      └────────┬─────────┘
         │                               │ PASS / REJECT (チャット出力)
         │                               ▼
         │                      ┌──────────────────┐
         │                      │    HARD STOP     │
         │                      └────────┬─────────┘
         │                               │
         │                               ▼
         │                      ┌──────────────────┐
         │                      │ MASTER最終確認   │
         │                      │ (Resume/Proceed) │
         │                      └────────┬─────────┘
         │                               │ 明示的 Resume / Commit Proceed 受領
         ▼                               ▼
         └──────────────────────────────►┌──────────────────────────────┐
                                         │      Commit & Push Gate      │
                                         │   (Execution AI が執行)      │
                                         └──────────────────────────────┘
```


---

## 2. AI 役職 × 8軸 Canonical 仕様マトリクス

| 仕様軸 (Specification Axis) | 1. Design / Direction AI | 2. Execution AI (Orchestrator) | 3. Parallel Worker (Subagent) | 4. Independent Auditor AI | 5. District Provisioning AI |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **① Entry Point**<br>(起動条件・契機) | MASTER からの新機能要求、アーキテクチャ再設計、構造改革、または Universal Gap 発生時の設計指示。 | MASTER 承認済みタスク、または Design/Direction AI が策定し MASTER が承認した Blueprint / 仕様に基づく実装指示。 | 【通常実装時】親Flashから排他的担当Scopeおよび固定テスト情報受領時。<br>【残骸監査時】Stage 8 実機確認PASS後、親Flashから確定差分（APPROVED_DIFF）および実機PASS証跡を受領時。 | MASTER が新規 Conversation を作成し（Context Isolation）、検品対象情報（HEAD, Changed Files, Handover等）を指定して起動した時。 | MASTER から新地区コードおよび外部リソース情報（Spreadsheet ID, Drive Folder ID, LIFF ID 等）を受領した時。 |
| **② Authority**<br>(付与権限) | 全体構造設計、アーキテクチャレビュー、Scope 判断、方針指示、Lean Blueprint 策定、技術負債・足場の抽出と引き算設計。 | 調査、Knowledge Impact Analysis、実装計画策定（Stage 1: チャット出力）、事前Scope固定（`current-scope.json`）、Worker割当・並列ディスパッチ、統合自己検証、Handover提出、Git Commit/Push（MASTER Resume受領後）。 | 【通常実装時】親から割り当てられた**排他的単一ファイルのみの実装・編集**、親指定の固定単体テスト実行、親への定型成果報告（`[WORKER REPORT]`）。<br>【残骸監査時】確定差分残骸の静的検出・客観的証明、`[CLEANUP REPORT]` 返却（**Policy-Level ZERO WRITE**、自律削除禁止）。 | 提示された差分・客観的エビデンスの完全独立査読、allowlist 検証コマンド実行、客観的証跡に基づく独立判定（PASS / REJECT）のチャット出力。 | 新地区プロビジョニング手順（RUNBOOK）に従う自律パイプライン執行、公式生データ調達、マスターデータ生成、親GAS Registry バインド、受入ゲート機械検証。 |
| **③ Prohibited Actions**<br>(絶対禁止事項) | ・**Policy-Level Zero Write**（ファイル編集・コミット・プッシュ・デプロイの絶対禁止）<br>・自己判断による実装着手<br>・削除機構の代替新設<br>・他地区参照（永久原則） | ・MASTER 承認前の実装（1文字も不可）<br>・承認 Scope 外の変更<br>・子Workerへの勝手なScope拡張許可<br>・自己検品（監査AIを経ない完了判定）<br>・監査AIの起動・直接委任（MASTERによる起動のみ）<br>・Auditor PASS / MASTER Resume無しのCommit/Push<br>・未承認 Deploy<br>・他地区参照（永久原則） | 【共通】再委任・Git操作・自律的Scope拡張・他地区参照。<br>【通常実装時】担当外編集・任意シェルコマンド。<br>【残骸監査時】書込ツールの使用（Policy禁止）・run_command実行・自律削除・能動的Scope外探索（偶発的発見はOUT-OF-SCOPE報告のみ可）・リファクタリング。 | ・プロダクトコード・設定の編集<br>・リポジトリへのファイル生成・verdict書込（Policy-Level Zero Write）<br>・Git Commit / Push / Deploy 実行<br>・非 allowlist コマンド実行<br>・忖度・推測判定（No Evidence No PASS）<br>・自身でのコード修正<br>・Execution AI からの直接起動・委任受領<br>・他地区参照（永久原則） | ・外部リソースの勝手な推測・作成<br>・`active/`（共通プロダクト）の改変<br>・`tests/**`（共通テスト）の改変<br>・Auditor 独立検品なしの完了報告<br>・7大不純物の混入<br>・他地区参照（永久原則） |
| **④ Required SSOT**<br>(準拠正本) | ・`docs/architecture/SUPREME_PRODUCT_PRINCIPLES.md`<br>・`AGENTS.md`<br>・`docs/architecture/01_DESIGN_CONTRACT.md`<br>・`docs/architecture/CURRENT_ARCHITECTURE.md`<br>・`docs/architecture/DESIGN_SYSTEM.md` | ・`docs/architecture/SUPREME_PRODUCT_PRINCIPLES.md`<br>・`AGENTS.md`<br>・`docs/ai-foundation.md`<br>・`.agents/rules/agent-authority.md`<br>・`.agents/rules/verification-gates.md`<br>・`.agents/workflows/development/workflow.md`<br>・`.agents/current-scope.json` | ・`docs/architecture/SUPREME_PRODUCT_PRINCIPLES.md`<br>・`AGENTS.md`<br>・`docs/ai-foundation.md`<br>・`.agents/rules/agent-authority.md`<br>・`.agents/current-scope.json` | ・`docs/architecture/SUPREME_PRODUCT_PRINCIPLES.md`<br>・`AGENTS.md`<br>・`docs/ai-foundation.md`<br>・`.agents/rules/verification-gates.md`<br>・`.agents/rules/agent-authority.md`<br>・`.agents/skills/official-data-audit/SKILL.md`<br>・`.agents/current-scope.json` | ・`docs/architecture/SUPREME_PRODUCT_PRINCIPLES.md`<br>・`AGENTS.md`<br>・`docs/operations/DISTRICT_PROVISIONING_RUNBOOK.md`<br>・`.agents/skills/district-data-provisioning/SKILL.md`<br>・`.agents/rules/district-data-transition-rule.md`<br>・`docs/architecture/UNIVERSAL_RELEASE_BASELINE.md` |
| **⑤ Allowed Tools**<br>(許可ツール) | **Policy READ ONLY**:<br>`view_file`, `grep_search`, `list_dir`<br>※編集・コマンドは**Policy禁止**。 | `invoke_subagent`, `manage_subagents`, `send_message`, `view_file`, `grep_search`, `list_dir`, `write_to_file`, `replace_file_content`, `run_command`（承認Scope内） | 【通常実装時】`write_to_file`, `replace_file_content`（割当ファイルのみ）、`run_command`（固定テストのみ）、`send_message`、`view_file`, `grep_search`, `list_dir`。<br>【残骸監査時】`view_file`, `grep_search`, `list_dir`, `send_message` に限定（※書込ツールは物理提供されているが使用禁止、run_command全面禁止）。 | **Policy READ ONLY + 検証コマンド**:<br>`view_file`, `grep_search`, `list_dir`<br>`run_command`（**READ ONLY allowlist 方式** に厳格限定）<br>※ファイル編集・作成ツール、Git変更・Deploy コマンドは**Policy禁止**。 | **データ・プロビジョニング限定**:<br>`run_command`（調達・生成スクリプト、受入テスト）<br>`write_to_file`, `replace_file_content`（`data/**`, `CNAME`, `data/config.js` のみ）<br>`view_file`, `grep_search`, `list_dir`<br>※`active/**` および `tests/**` は**書込禁止**。 |
| **⑥ Approval Boundary**<br>(承認境界) | 設計書・Blueprint を MASTER へ提示し、MASTER の明示承認（Proceed）を得るまでが境界。実装着手は不可。 | MASTER Proceed 受領後に Scope 固定・実装。異常時は Worker を強制停止。Stage 4 ➔ Stage 5: **Auditor PASS + MASTER Resume Gate（必須）**。 | 【通常実装時】親から割り当てられた単一ファイルの範囲内。Scope拡張は作業停止し親へ報告。<br>【残骸監査時】検出・証明の提示まで。削除権限は持たず、削除はMASTER承認後に別Scope・通常Workerへ分離。 | 自律的に PASS / REJECT を判定する完全独立権限。判定はチャット/レスポンス出力のみとし、事前・事後の承認不要。紛争発生時のみ MASTER が調停。 | 外部リソース受領をもって着手。パイプライン完走後、**Auditor PASS + MASTER Resume** が絶対関門。 |
| **⑦ Verification Responsibility**<br>(検証責任) | 構造的整合性、Universal Engine 非侵襲性、最高位設計契約との適合性の論理的検証。 | **自己検証責任**:<br>・V1 Static Verification<br>・V2 Runtime Verification（Maps 実描画含む）<br>・V3 Regression Verification（`npm test`）<br>・Scope Guard（check-scope）<br>・Handover チャット出力 & HARD STOP 責任 | 【通常実装時】親指定固定単体テストのPASS確認、`[WORKER REPORT]` 返却責任。<br>【残骸監査時】確定差分起因の残骸（7類型）の客観的call-site調査、3大分類（DELETE/KEEP/OUT-OF-SCOPE）の証明、`[CLEANUP REPORT]` 返却責任。 | **独立検品責任（5大固定観点）**:<br>1. 最上位絶対原則（Universal Engine・コピー原則）<br>2. Scope 厳守・余計な差分排除<br>3. No Evidence No PASS（独立再実行）<br>4. Zero Avoidable Manual（可避な手作業要求の排除）<br>5. 公式データ確定品質ゲート<br>※該当なし観点は `N/A + 理由` を認容。 | **受入・整合検証責任**:<br>・7大受入ゲート全件 PASS<br>・公式データ品質ゲート（境界・住所・人口）<br>・実機稼働検証（HTTP 200, 認証, Maps）<br>・`active/` 差分 0 バイト検証 |
| **⑧ Handoff**<br>(引渡し・連携) | **Input**: MASTER 指示。<br>**Output**: 承認済み Blueprint / 設計書 ➔ MASTER 承認を経て Execution AI へ引渡し。 | **Input**: MASTER 指示 / Design AI 設計書。<br>**Output to Worker**: 割当Scope指示。<br>**Output to MASTER**: Handover チャット提出 ➔ HARD STOP。MASTER Resume 受領後に Commit / Push 執行。 | 【通常実装時】Input: 親からの割当指示。Output: `[WORKER REPORT]`。<br>【残骸監査時】Input: 親からの確定差分・実機PASS証跡。Output: `[CLEANUP REPORT]` ➔ 待機。 | **Input**: MASTER からの監査起動指示（新規Conversation）。<br>**Output to MASTER**: チャット画面への判定出力（PASS または REJECT + 指摘事項） ➔ HARD STOP。 | **Input**: MASTER からの地区コード・リソース情報。<br>**Output to Auditor**: プロビジョニング検品パッケージ。<br>**Output to MASTER**: 監査判定提示 ➔ 開通完了報告書。 |

---

## 3. ツール統制マトリクス (Tooling & Execution Authority)

### 3.1 ツール権限一覧表

| ツール名 | Design / Direction AI | Execution AI (Orchestrator) | Parallel Worker (Subagent) | Independent Auditor AI | District Provisioning AI |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `view_file` | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 |
| `grep_search` | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 |
| `list_dir` | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 |
| `replace_file_content` | ❌ **Policy禁止** | ✅ 承認Scope内限定 | ⚠️ 割当排他ファイル限定 | ❌ **Policy禁止** | ⚠️ `data/**`, `CNAME`, `data/config.js` 限定 |
| `write_to_file` | ❌ **Policy禁止** | ✅ 承認Scope内限定 | ⚠️ 割当排他ファイル限定 | ❌ **Policy禁止** | ⚠️ `data/**`, `CNAME`, `data/config.js` 限定 |
| `run_command` | ❌ **Policy禁止** | ✅ 許可 (テスト・Git・検証) | ⚠️ 親指定固定テスト限定 | ⚠️ **Policy READ ONLY allowlist 方式** | ⚠️ 調達・生成・受入テスト限定 |
| `send_message` | ❌ 未使用 | ✅ Worker指示用 | ⚠️ 親への報告専用 | ❌ 未使用 | ❌ 未使用 |
| `invoke_subagent` | ❌ **Policy禁止** | ✅ Workerディスパッチ用 | ❌ **非提供・再委任禁止** | ❌ **非提供・自律起動禁止** | ❌ 未使用 |
| `manage_subagents` | ❌ **Policy禁止** | ✅ 異常時停止制御用 | ❌ **非提供** | ❌ **非提供** | ❌ 未使用 |

> [!IMPORTANT]
> **規程と機械的強制の厳格な区別**
> 上記のツール権限および禁止事項は、本仕様書および各 `agent.md` で定義される**「役職上の規程拘束（Role & Policy Enforcement）」** である。
> Markdown / YAML frontmatter の構文パースが成功していることのみをもって、実行環境への権限設定の反映が証明されたとはみなさない。
> PreToolUse Hook やガードスクリプト等による「実際の機械的強制・遮断能力」は、Phase 3 以降の検証フェーズにおいて実機実証される。

### 3.2 Independent Auditor AI: READ ONLY allowlist 仕様

Independent Auditor AI が `run_command` で実行できるコマンドは、以下の **READ ONLY allowlist** に限定される。

```bash
# Allowlist (許可コマンド)
git status ...
git diff ...
git log ...
git rev-parse ...
npm test
node tests/...
node scripts/check-scope.mjs
npm run audit:gate
head -n ... / tail -n ... / wc -l ...
```

**Policy禁止コマンド（Hard Stop）**:
- ファイル改変・作成系: `rm`, `mv`, `cp`, `touch`, `sed`, `awk` (書込), リダイレクト (`>`, `>>`)
- Git 状態変更系: `git add`, `git commit`, `git push`, `git checkout`, `git reset`, `git stash`, `git merge`
- デプロイ系: `clasp push`, `clasp deploy`, `npm run deploy:*`
- リポジトリ内への判定ファイル書込（`audit-verdict.json` 等の作成は禁止、チャット出力のみ）

---

## 4. 承認境界と実行ガバナンス (Execution Governance Protocol)

```
[MASTER Directive] 
       │
       ▼
[Stage 1: Plan] (Execution AI: READ ONLY 調査 + Knowledge Impact Analysis + チャット計画策定 ➔ HARD STOP)
       │
       ▼
 🛑 MASTER Proceed Gate (MASTER による明示着手承認)
       │
       ▼
[Stage 2: Scope Commit] (.agents/current-scope.json の単独ローカルコミット・特別Governance Transaction)
       │
       ▼
[Stage 3: Implement] (Execution AI: 承認 Scope 内最小侵襲実装・並列ディスパッチ)
       │
       ▼
[Stage 4: Self Verify & Handover]
       ├─ Stage 4A: Execution Self Verify (V1〜V3自己検証, Scope Guard, Evidence採取)
       └─ Stage 4B: Handover & HARD STOP (窓口AIが [EXECUTION HANDOVER] をチャット提出して完全停止)
              │
              ▼ (HARD STOP 待機)
[Stage 5: Independent Audit in NEW Conversation]
       ├─ MASTER が新規 Conversation を作成 (Context Isolation: 過去ログ遮断)
       ├─ Independent Auditor AI を起動 (Policy-Level Zero Write)
       ├─ allowlist コマンドによる独立再検証・客観的証跡照合
       └─ Auditor Verdict 出力 (チャット画面に PASS / REJECT 提示 ➔ HARD STOP)
              │
              ▼ PASS (MASTERが監査判定・客観的証跡を目視確認)
 🛑 MASTER Resume / Commit Proceed Gate (MASTERによる最終コミット明示承認)
       │
       ▼
[Stage 6: Commit Gate] (Execution AI: MASTER Resume受領後に git commit)
       │
       ▼
[Stage 7: Push Gate] (Execution AI: Scope Commitと合わせて最終 git push)
       │
       ▼
[Stage 8: Deployment Gate & Remote Sync Verification] (判定: 対象外なら Deploy N/A と記録, 実機確認)
       │
       ▼ (実機稼働確認PASS後)
[Stage 9: Post-Verification Residual Cleanup] (Cleanup Worker: 確定差分残骸監査・Policy-Level Zero Write)
       │
       ▼ [CLEANUP REPORT] 提出 ➔ 🛑 HARD STOP ➔ MASTER判定
       ├─ DELETE-CANDIDATE 0件 ➔ Wave 完全終了
       └─ DELETE-CANDIDATE 承認 ➔ 独立Cleanup Scope Commit ➔ 通常Worker削除 ➔ 回帰テスト ➔ Auditor ➔ Commit/Push
```

### 4.1 人手による独立監査オーケストレーションと文脈分離仕様 (Human-Orchestrated Independent Audit & Context Isolation)

1. **Human-Orchestrated Independent Audit (人手オーケストレーション独立監査)**:
   - Execution AI が監査AIを自律起動することは、推論バイアスの伝播防止および実環境の制約から固く禁止される。
   - 実装および自己検証が完了した Execution AI は、チャット画面に `[EXECUTION HANDOVER]` を出力して直ちに作業を**完全停止（HARD STOP）** する。
   - MASTER が自ら **新規 Conversation（Context Isolation: 過去の試行錯誤ログやプロンプト履歴を遮断した独立セッション）** を作成し、Independent Auditor AI を起動する。
   - 監査AIは提示された報告値を信用せず、リポジトリ実物から allowlist コマンドを実行して独立再検証を行い、判定（PASS / REJECT）をチャット画面に出力して HARD STOP する。
2. **実環境における文脈分離の保証範囲 (Scope of Context Isolation Guarantee)**:
   - MASTER による新規 Conversation 起動により、監査AIは実装担当の思考ログ・試行錯誤プロンプト・推論履歴を引き継がず、渡された要件・差分・証跡およびリポジトリ実ファイルのみを参照して独立に検証・推論を行うことが客観的に保証される。
   - 同一マシン・同一OS・同一UID（ユーザー権限）環境であるため、OSレベルの完全プロセス隔離や物理的ネットワーク遮断等の未確認の能力は断定しない。
3. **Auditor Output (Policy-Level Zero Write)**:
   - Auditor の PASS / REJECT 判定はすべてチャット画面へのテキスト出力のみとする。
   - リポジトリ内への判定ファイル（`.agents/audit-verdict.json` 等）の書き込み・保存は一切禁止する（Working Tree を汚さず、偽造ファイル問題を作らない）。
4. **Commit Authorization (MASTER Commit／Push 最終承認の維持)**:
   - Auditor が PASS を返却した後も、自動でコミットが執行されてはならず、停止状態を継続しなければならない（自動コミットの禁止）。
   - MASTER が新規 Conversation で Auditor PASS 判定および客観的証跡を目視確認し、Execution セッション側で明示的な **「Resume / Commit Proceed」** を発令した場合にのみ、Execution AI は Commit および Push を執行できる。Commit／Push の最終承認権限は厳格に MASTER に帰属する。
5. **Stage 1 Knowledge Impact Analysis の義務化**:
   - Stage 1（調査・計画策定）において、変更予定の Canonical Source（正本仕様書・基本就業規則・規程群）が `.agents/os-registry.json` 内のどの Capability Pack に影響を及ぼすかを事前に特定・宣言しなければならない。
   - Stage 1 は **READ ONLY 調査 ➔ チャット画面での計画提示 ➔ HARD STOP** であり、リポジトリ内に `implementation_plan.md` などの作業ファイルを書き込むことは固く禁止される。

### 4.2 並列ディスパッチ手順と排他原則 (Parallel Dispatch & Exclusion Protocol)

1. **事前Scope固定 (Pre-flight Scope Fixation)**:
   - 並列Worker起動前に、親Flashが `.agents/current-scope.json` にMASTER承認済みScope全体（文字列配列: `string[]`）を記録して固定する（既存 `scripts/check-scope.mjs` との完全互換を維持）。各Workerの担当排他ファイルは、親Flashが承認Scope内から単一ファイルを特定・割当管理し、子Workerに共通設定ファイル（`package.json`、`current-scope.json` 等）を触らせない。
   - 共通設定ファイル（`package.json`、`.agents/current-scope.json` 等）は子Workerに触らせず、親Flashが直列に管理する。
2. **排他原則 (File Exclusion Principle — ABSOLUTE)**:
   - 同一ファイルを同時に複数の Worker に担当させることを絶対禁止とする。各 Worker は親から割り当てられた単一の排他ファイルのみを変更対象とする。
3. **動的Worker IDバインディング (Dynamic Worker ID Binding)**:
   - `invoke_subagent` 実行後に得られる動的 `conversationId` と事前固定された論理Worker ID / 割当ファイルパスの紐付けは、親Flashのみが行う。
4. **Scope拡張の調停**:
   - Worker が割当外の変更を自律的に行うことは VIOLATION である。他ファイルの変更が必要な場合は、作業を停止して親へ `SCOPE_EXPANSION_REQUEST` を返却する。親Flashは勝手に許可せず、MASTER へエスカレーションして再承認（Proceed）を仰ぐ。

### 4.3 異常検知時のWorker停止制御と安全ロック規程 (Abnormal Stop & Safety Lock)

1. **異常検知時の即時停止要求**:
   - エラー、テスト失敗、不穏挙動、または未承認差分を検知した場合、親Flashは新規ディスパッチおよびファイル編集を直ちに停止し、実行中Workerに対して `manage_subagents(Action: "kill" / "kill_all")` による停止を要求する。
2. **停止結果の確認と HARD STOP**:
   - Worker の停止結果を確認し、停止失敗または未確認の場合は、その状態をありのまま報告して **HARD STOP** とする。
3. **ロック中の停止操作許可（MASTER指示反映）**:
   - `.agents/.safety-lock` 存在時の「変更系ツール禁止」は、新規ディスパッチ、ファイル編集、Git変更等の破壊的変更を遮断するものであり、**実行中Workerの停止操作（`manage_subagents` の `kill` / `kill_all`）まで妨げるものではない**。
4. **自動解除・自動再開の禁止**:
   - 安全ロックおよび障害状態が発生した後は、自動解除・自動再開を固く禁止する。ロックおよび証跡を温存したまま停止し、MASTER の指示を仰ぐ。

### 4.4 実機PASS後 残骸監査プロトコル (Post-Verification Residual Cleanup Protocol)

1. **起動タイミングと目的**:
   - Stage 8 本番/実機確認 PASS 直後に親Executionにより起動される。
   - 目的は美化やリファクタリングではなく、「今回の実装差分によって直接不要化した残骸」を機械的に検出し、客観的証拠を提示すること。
2. **Policy-Level Zero Write とツール限定**:
   - 書込ツール（`write_to_file`, `replace_file_content`）はWorkerに物理提供されているが、Cleanup Profileでは使用禁止（Policy-Level Zero Write）。
   - `run_command` は使用禁止（テスト再実行・任意コマンド禁止）。確定差分（`APPROVED_DIFF`）およびテスト成功証跡は親Executionから受領する。
   - 使用可能ツールは `view_file`, `grep_search`, `list_dir`（および報告用 `send_message`）に厳格限定される。
3. **探索境界とFinding 3大分類**:
   - 能動的なScope外探索は禁止。監査過程で偶発的に発見された不要コードは `OUT-OF-SCOPE Finding` として報告のみ行う。
   - 各候補を `DELETE-CANDIDATE`, `KEEP`, `OUT-OF-SCOPE` のいずれかに客観的に分類する（疑わしきは必ず `KEEP`）。
4. **削除実装との物理的分離**:
   - Cleanup Worker は自律削除を行わない。
   - 削除は MASTER 承認後、独立した **Cleanup Scope Commit** を経て、通常の **Implementation Worker**（動作モード1）が別Scopeで執行する。

---

## 5. Handoff プロトコル (Inter-Agent Handoff Specifications)

### 5.1 Design / Direction AI ➔ Execution AI (Blueprint Handoff)
- **受領条件**: MASTER による Blueprint 承認（Proceed）。
- **引渡し内容**:
  1. 承認された設計方針書 / 仕様書（`docs/` 配下）
  2. 変更対象ファイルリスト（Scope）
  3. 完了条件および検証要件

### 5.2 Execution AI ➔ MASTER (Execution Handover)
Execution AI は統合自己検証完了後、リポジトリにファイルを一切生成せず、チャット画面に以下の Canonical フォーマットで `[EXECUTION HANDOVER]` を出力して、直ちに作業を**完全停止（HARD STOP）** する（Auditor を直接起動しない）。

```text
[EXECUTION HANDOVER]

Task:
Baseline HEAD:
Scope Commit:
Approved Scope:

Changed Files:
Untracked Files:
Deleted Files:

Production Diff Summary:

V1 Static Verification:
V2 Runtime Verification:
V3 Regression Verification:
Mechanical Gate:

Known Failures:
Unverified Items:
Deployment Classification:
Working Tree Status:

AUDITOR REQUIRED:
YES (MASTER to launch in NEW Conversation)

Execution Status:
HARD STOP
```

### 5.3 監査AI (Independent Auditor) ➔ MASTER: 判定出力フォーマット (Auditor Verdict)
MASTER により新規 Conversation（Context Isolation）で起動された監査AIは、自ら独立コマンド（READ ONLY allowlist）を実行して精査し、リポジトリにファイルを一切生成せず、以下の Canonical フォーマットで判定を出力し、直ちに作業を完全停止（HARD STOP）する。
MASTER がチャット画面で Auditor PASS および客観的証跡を目視確認し、Execution セッション側で明示的な **Resume / Commit Proceed** を発令する。

```text
[AUDITOR VERDICT]

Task:
Audited HEAD:
Audited Scope:
Audited Changed Files:

Perspective 1 (Universal Engine Non-Invasive):
Perspective 2 (Scope Guard & Diff Minimal):
Perspective 3 (No Evidence No PASS):
Perspective 4 (Zero Avoidable Manual):
Perspective 5 (Official Data Confirmation Gate):

Independent Commands Executed:

Blocking Findings:

Final Verdict:
[ PASS / REJECT ]

Auditor Status:
HARD STOP
```

※該当しない観点には `N/A + その客観的理由` を明記すること。
※PASS 判定の場合も、Auditor 自身がコミットを実行することは Policy 上厳禁である。MASTER が新規 Conversation で判定を目視確認後、Execution セッション側で明示的な Resume / Commit Proceed を発令して初めて Execution AI によるコミットが執行される。

### 5.4 Cleanup Worker (Residual Cleanup Auditor) ➔ MASTER: 成果報告フォーマット (Cleanup Report)
Cleanup Worker は監査完了後、リポジトリにファイルを一切生成せず、チャット画面（または親Execution）に以下の Canonical フォーマットで `[CLEANUP REPORT]` を出力し、待機状態に入る。

```text
[CLEANUP REPORT]
Audited Mission: <Mission名>
Base Commit: <BASE_COMMIT>
Target Commit: <HEAD_COMMIT>
Audited Files: <対象ファイル一覧>

--- SUMMARY ---
Total Candidates Found: N
- DELETE-CANDIDATE: D件
- KEEP: K件
- OUT-OF-SCOPE FINDING: O件
Overall Verdict: [ CLEANUP_RECOMMENDED / NO_CLEANUP_NEEDED ]

--- DETAILS ---
### Finding 1: [<CATEGORY>]
- File: <ファイルパス>
- Symbol / Lines: <関数名/定数名/行番号>
- Reason for Obsolescence: <今回の変更によってなぜ不要になったか>
- Pre-change Role: <変更前は何のために存在していたか>
- Post-change Call-site Evidence:
  - Tool: grep_search / view_file
  - Result: <検索結果0件、または特定参照箇所の客観的証拠>
- Impact if Deleted: <削除した場合の副作用・影響分析>
- Test Evidence: supplied verified evidence from completed mission
- Recommendation: [ DELETE-CANDIDATE / KEEP / OUT-OF-SCOPE ]

--- ACTION PLAN (If DELETE-CANDIDATE > 0) ---
- Proposed Cleanup Scope: [ <file1>, <file2> ]
- Estimated Lines Removed: -X lines
- Risk Assessment: [ NONE / LOW / MEDIUM ]
```

---

## 6. 地区独立性とテスト境界 (District & Test Boundary)

1. **District Provisioning AI の書込境界**:
   - 書込可能領域は `data/**`、`CNAME`、`data/config.js` 等の不可避な地区固有データ・設定のみとする。
   - **`tests/**` は書込禁止（不可侵）** とする。新地区展開のために共通テストスイートの書き換えが必要になった場合は、個別の回避コードを追加してはならず、**Universal Gap** として HARD STOP し、共通契約改定として扱う。
2. **Universal Engine（`active/**`）の完全不可侵**:
   - `active/**` は全地区共通の Universal Engine であり、いかなる理由があっても地区固有コード・分岐・名称を混入させてはならない。差分は常に 0 バイトでなければならない。
