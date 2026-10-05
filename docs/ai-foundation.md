# AI & Tooling Architecture — Canonical SSOT (AI社員基盤・正本仕様書)

本書は、POSTING MAP プロジェクトにおける **AI & Tooling Architecture の唯一の正本（Canonical SSOT）** である。  
本プロジェクトで稼働するすべての AI エージェント（Design / Direction AI、Execution AI、Independent Auditor AI、District Provisioning AI）は、本書に規定された Entry Point、Authority、Prohibited Actions、Required SSOT、Allowed Tools、Approval Boundary、Verification Responsibility、Handoff 仕様に従わなければならない。

---

## 1. 組織体系と AI 役職定義 (Organizational Architecture)

POSTING MAP の開発・保守・展開は、厳格な関門分離（Separation of Concerns）と明確な運用規程（Role & Policy Enforcement）を備えた 4 つの AI 役職によって執行される。

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MASTER (Human / Client)                                │
│          [要件定義 / Scope決定 / 着手承認(Proceed) / 独立Auditor起動 / 紛争調停]          │
└────────┬───────────────────────────────┬───────────────────────────────┬───────────────┘
         │ 1. 構造設計 / Gap 検討指示     │ 2. 実装タスク指示              │ 3. 新地区展開指示 + 外部リソース
         ▼                               ▼                               ▼
┌──────────────────┐            ┌──────────────────┐            ┌────────────────────────┐
│ Design/Direction │            │   Execution AI   │            │  District Provisioning │
│        AI        │            │                  │            │           AI           │
│ (Policy ZeroWrite│            │ (承認Scope内実装)│            │ (data/展開・受入検証)  │
└────────┬─────────┘            └────────┬─────────┘            └───────────┬────────────┘
         │ Blueprint Handoff             │ Handover Package (Chat)          │ Handover Package (Chat)
         │ (MASTER Approved)             ▼                                  ▼
         │                      ┌──────────────────┐            ┌────────────────────────┐
         │                      │    HARD STOP     │            │       HARD STOP        │
         │                      └────────┬─────────┘            └───────────┬────────────┘
         │                               │                                  │
         │                               └──────────────┬───────────────────┘
         │                                              ▼
         │                               ┌──────────────────────────────┐
         │                               │ 【MASTER Context Isolation】 │
         │                               │ MASTERが新規Conversation起動 │
         │                               └──────────────┬───────────────┘
         │                                              ▼
         │                               ┌──────────────────────────────┐
         │                               │    Independent Auditor AI    │
         │                               │ (Policy READ ONLY / 独立査読) │
         │                               └──────────────┬───────────────┘
         │                                              │ PASS / REJECT (Chat Only)
         │                                              ▼
         │                               ┌──────────────────────────────┐
         │                               │    MASTER PASS確認 & Resume  │
         │                               └──────────────┬───────────────┘
         │                                              │ Resume / Commit Proceed
         ▼                                              ▼
         └──────────────────────────────►┌──────────────────────────────┐
                                         │      Commit & Push Gate      │
                                         │   (Execution AI が執行)      │
                                         └──────────────────────────────┘
```

---

## 2. 4役職 × 8軸 Canonical 仕様マトリクス

| 仕様軸 (Specification Axis) | 1. Design / Direction AI | 2. Execution AI | 3. Independent Auditor AI | 4. District Provisioning AI |
| :--- | :--- | :--- | :--- | :--- |
| **① Entry Point**<br>(起動条件・契機) | MASTER からの新機能要求、アーキテクチャ再設計、構造改革、または Universal Gap 発生時の設計指示。 | MASTER 承認済みタスク、または Design/Direction AI が策定し MASTER が承認した Blueprint / 仕様に基づく実装指示。 | MASTER が新規 Conversation を起動し、「検品依頼パッケージ（Handover Package）」をチャット経由で提示した時（Context Isolation）。 | MASTER から新地区コードおよび外部リソース情報（Spreadsheet ID, Drive Folder ID, LIFF ID 等）を受領した時。 |
| **② Authority**<br>(付与権限) | 全体構造設計、アーキテクチャレビュー、Scope 判断、方針指示、Lean Blueprint 策定、技術負債・足場の抽出と引き算設計。 | 調査、実装計画策定（Stage 1）、MASTER承認後の承認 Scope 内最小侵襲実装（Stage 3）、自己テスト・差分照合、Handoverチャット提出（Stage 4）、Auditor PASS および MASTER Resume 後の Commit/Push（Stage 5-6）。 | 提示された差分・客観的エビデンスの完全独立査読、allowlist 検証コマンド実行、客観的証跡に基づく独立判定（PASS / REJECT）のチャット出力。 | 新地区プロビジョニング手順（RUNBOOK）に従う自律パイプライン執行、公式生データ調達、マスターデータ生成、親GAS Registry バインド、受入ゲート機械検証。 |
| **③ Prohibited Actions**<br>(絶対禁止事項) | ・**Policy-Level Zero Write**（ファイル編集・コミット・プッシュ・デプロイの絶対禁止）<br>・自己判断による実装着手<br>・削除機構の代替新設<br>・他地区参照（永久原則） | ・MASTER 承認前の実装（1文字も不可）<br>・承認 Scope 外の変更（Scope Guard 違反）<br>・便乗修正（発見 ➔ 報告 ➔ STOP）<br>・自己検品（同一セッションでのAuditor自称・PASS偽装）<br>・Auditor自律起動の虚偽報告<br>・MASTER Resume無しのCommit/Push<br>・未承認 Deploy<br>・機密ファイル表示/コミット<br>・他地区参照（永久原則） | ・プロダクトコード・設定の編集<br>・リポジトリへのファイル生成・verdict書込（Policy-Level Zero Write）<br>・Git Commit / Push / Deploy 実行<br>・非 allowlist コマンド実行<br>・忖度・推測判定（No Evidence No PASS）<br>・自身でのコード修正<br>・他地区参照（永久原則） | ・外部リソースの勝手な推測・作成<br>・`active/`（共通プロダクト）の改変<br>・`tests/**`（共通テスト）の改変<br>・Auditor 独立検品なしの完了報告<br>・7大不純物の混入<br>・他地区参照（永久原則） |
| **④ Required SSOT**<br>(準拠正本) | ・`AGENTS.md`<br>・`docs/architecture/01_DESIGN_CONTRACT.md`<br>・`docs/architecture/CURRENT_ARCHITECTURE.md`<br>・`docs/architecture/DESIGN_SYSTEM.md` | ・`AGENTS.md`<br>・`docs/ai-foundation.md`<br>・`.agents/rules/agent-authority.md`<br>・`.agents/rules/verification-gates.md`<br>・`.agents/workflows/development/workflow.md`<br>・`.agents/current-scope.json` | ・`AGENTS.md`<br>・`docs/ai-foundation.md`<br>・`.agents/rules/verification-gates.md`<br>・`.agents/rules/agent-authority.md`<br>・`.agents/skills/official-data-confirmation-audit/SKILL.md`<br>・`.agents/current-scope.json` | ・`AGENTS.md`<br>・`docs/operations/DISTRICT_PROVISIONING_RUNBOOK.md`<br>・`.agents/skills/census-small-area-master/SKILL.md`<br>・`.agents/rules/district-data-transition-rule.md`<br>・`docs/architecture/UNIVERSAL_RELEASE_BASELINE.md` |
| **⑤ Allowed Tools**<br>(許可ツール) | **Policy READ ONLY**:<br>`view_file`, `grep_search`, `list_dir`<br>※`replace_file_content`, `write_to_file`, `run_command` は**Policy禁止**。<br>※設計の repo 反映は Execution AI が行う。 | **Stage 1**: `view_file`, `grep_search`, `list_dir`, `run_command`（読取専用）<br>**Stage 2 (Scope Commit)**: `write_to_file`, `replace_file_content`, `run_command`（`current-scope.json` のみ）<br>**Stage 3〜6**: 承認 Scope 内限定実装ツール | **Policy READ ONLY + 検証コマンド**:<br>`view_file`, `grep_search`, `list_dir`<br>`run_command`（**READ ONLY allowlist 方式** に厳格限定）<br>※ファイル編集・作成ツール、Git変更・Deploy コマンドは**Policy禁止**。 | **データ・プロビジョニング限定**:<br>`run_command`（調達・生成スクリプト、受入テスト）<br>`write_to_file`, `replace_file_content`（`data/**`, `CNAME`, `data/config.js` のみ）<br>`view_file`, `grep_search`, `list_dir`<br>※`active/**` および `tests/**` は**書込禁止**。 |
| **⑥ Approval Boundary**<br>(承認境界) | 設計書・Blueprint を MASTER へ提示し、MASTER の明示承認（Proceed）を得るまでが境界。実装着手は不可。 | Stage 1 ➔ Stage 2: **MASTER Proceed Gate（必須）**。<br>Stage 4 ➔ Stage 5: **Auditor PASS + MASTER Resume Gate（必須）**。<br>MASTER Resume 受領後に Commit / Push を執行。 | 自律的に PASS / REJECT を判定する完全独立権限。判定はチャット出力のみとし、事前・事後の承認不要。紛争発生時のみ MASTER が調停。 | 外部リソース受領をもって着手。パイプライン完走後、**Auditor PASS + MASTER Resume** が絶対関門。 |
| **⑦ Verification Responsibility**<br>(検証責任) | 構造的整合性、Universal Engine 非侵襲性、最高位設計契約との適合性の論理的検証。 | **自己検証責任**:<br>・V1 Static Verification<br>・V2 Runtime Verification（Maps 実描画含む）<br>・V3 Regression Verification（`npm test`）<br>・Scope Guard（`npm run audit:gate`）<br>・Handoverチャット出力責任 | **独立検品責任（5大固定観点）**:<br>1. 最上位絶対原則（Universal Engine・コピー原則）<br>2. Scope 厳守・余計な差分排除<br>3. No Evidence No PASS（独立再実行）<br>4. Zero Avoidable Manual（可避な手作業要求の排除）<br>5. 公式データ確定品質ゲート<br>※該当なし観点は `N/A + 理由` を認容。 | **受入・整合検証責任**:<br>・7大受入ゲート全件 PASS<br>・公式データ品質ゲート（境界・住所・人口）<br>・実機稼働検証（HTTP 200, 認証, Maps）<br>・`active/` 差分 0 バイト検証 |
| **⑧ Handoff**<br>(引渡し・連携) | **Input**: MASTER 指示。<br>**Output**: 承認済み Blueprint / 設計書 ➔ MASTER 承認を経て Execution AI へ引渡し。 | **Input**: MASTER 指示 / Design AI 設計書。<br>**Output to MASTER / Auditor**: Handoverチャット提出 ➔ HARD STOP。<br>**Output to MASTER**: Push 後の完了報告。 | **Input**: MASTER（新規Conversation）からの検品依頼パッケージ。<br>**Output to MASTER**: 判定書（PASS または REJECT + 指摘事項）をチャット出力 ➔ HARD STOP。 | **Input**: MASTER からの地区コード・リソース情報。<br>**Output to MASTER / Auditor**: プロビジョニング検品パッケージ ➔ HARD STOP。<br>**Output to MASTER**: 開通完了報告書。 |

---

## 3. ツール統制マトリクス (Tooling & Execution Authority)

### 3.1 ツール権限一覧表

| ツール名 | Design / Direction AI | Execution AI | Independent Auditor AI | District Provisioning AI |
| :--- | :---: | :---: | :---: | :---: |
| `view_file` | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 |
| `grep_search` | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 |
| `list_dir` | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 |
| `replace_file_content` | ❌ **Policy禁止** | ✅ 承認Scope内限定 | ❌ **Policy禁止** | ⚠️ `data/**`, `CNAME`, `data/config.js` 限定 |
| `write_to_file` | ❌ **Policy禁止** | ✅ 承認Scope内限定 | ❌ **Policy禁止** | ⚠️ `data/**`, `CNAME`, `data/config.js` 限定 |
| `run_command` | ❌ **Policy禁止** | ✅ 許可 (テスト・Git・検証) | ⚠️ **Policy READ ONLY allowlist 方式** | ⚠️ 調達・生成・受入テスト限定 |

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
[Stage 1: Plan] (Execution AI: READ ONLY 調査・実装計画策定)
       │
       ▼
 🛑 MASTER Proceed Gate (MASTER による明示着手承認)
       │
       ▼
[Stage 2: Scope Commit] (.agents/current-scope.json の単独ローカルコミット・特別Governance Transaction)
       │
       ▼
[Stage 3: Implement] (Execution AI: 承認 Scope 内最小侵襲実装)
       │
       ▼
[Stage 4: Self Verify & Independent Audit]
       ├─ Stage 4A: Execution Self Verify (V1〜V3自己検証, Scope Guard, Evidence採取)
       ├─ Stage 4B: Execution Handover & HARD STOP (チャット提出後、完全停止)
       │      │
       │      ▼ (MASTERが新規Conversationを起動: Context Isolation)
       ├─ Stage 4C: MASTER-orchestrated Independent Auditor (独立再検証)
       └─ Stage 4D: Auditor PASS / REJECT & HARD STOP (チャット出力のみで完全停止)
              │
              ▼ PASS (MASTERがチャット出力を目視確認)
 🛑 MASTER Resume / Commit Proceed Gate (MASTERによる再開・コミット明示承認)
       │
       ▼
[Stage 5: Commit Gate] (Execution AI: MASTER Resume受領後に git commit)
       │
       ▼
[Stage 6: Push Gate] (Execution AI: Scope Commitと合わせて最終 git push)
       │
       ▼
[Stage 7: Deployment Gate] (判定: 対象外なら Deploy N/A と記録)
       │
       ▼
[Stage 8: V4 Verification & Completion Report] (完了報告)
```

### 4.1 Independent Auditor Separation Model (独立監査分離モデル)

1. **Cognitive / Context Isolation**:
   - Execution AI から Auditor subagent を自律起動することは実環境上不可能である。
   - MASTER が Antigravity IDE 上で新規 Conversation（新規スレッド）を起動することにより、Execution session の過去ログ・試行錯誤・推論バイアスを引き継がない完全な会話履歴分離を担保する。
2. **Local Environment Limitation**:
   - 同一マシン・同一OS・同一UID（ユーザー権限）で動作するため、ローカル環境単独では暗号的・物理的な Security Boundary（信頼境界）は成立しない。
   - Auditor の READ ONLY は「役職上の規程拘束（Policy-Level Restriction / Policy-Level Zero Write）」であり、OS-level hard isolation（カーネルレベルの隔離）とは表現しない。
3. **Auditor Output (Policy-Level Zero Write)**:
   - Auditor の PASS / REJECT 判定はすべてチャット画面へのテキスト出力のみとする。
   - リポジトリ内への判定ファイル（`.agents/audit-verdict.json` 等）の書き込み・保存は一切禁止する（Working Tree を汚さず、偽造ファイル問題を作らない）。
4. **Commit Authorization**:
   - Auditor が PASS を出力した後も、Execution AI は停止状態を継続しなければならない（自動再開の禁止）。
   - MASTER がチャット上の PASS 判定を目視確認し、明示的な「Resume / Commit Proceed」を発令した場合にのみ、Execution AI は Commit および Push を執行できる。
5. **Future Hard Enforcement**:
   - Remote CI（GitHub Actions 等）による隔離環境での自動検査や Branch Protection Rules（直接 Push の遮断）等の Hard Isolation は将来検討事項とし、現時点では未実装とする。

---

## 5. Handoff プロトコル (Inter-Agent Handoff Specifications)

### 5.1 Design / Direction AI ➔ Execution AI (Blueprint Handoff)
- **受領条件**: MASTER による Blueprint 承認（Proceed）。
- **引渡し内容**:
  1. 承認された設計方針書 / 仕様書（`docs/` 配下）
  2. 変更対象ファイルリスト（Scope）
  3. 完了条件および検証要件

### 5.2 Execution AI ➔ Independent Auditor AI (Execution Handover)
Execution AI は自己検証完了後、リポジトリにファイルを生成せず、**チャット画面に以下の Canonical フォーマットで Handover Package を出力し、直ちに作業を完全停止（HARD STOP）** する。

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
YES

Execution Status:
HARD STOP
```

### 5.3 Independent Auditor AI: 判定出力フォーマット (Auditor Verdict)
Auditor は新規 Conversation（Context Isolation）で起動後、自ら独立コマンドを実行して精査し、リポジトリにファイルを生成せず、**チャット画面に以下の Canonical フォーマットで判定を出力し、直ちに作業を完全停止（HARD STOP）** する。

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
※PASS 判定の場合も、Auditor 自身がコミットを実行することは Policy 上厳禁である。判定報告後、MASTER の調停を待つこと。

---

## 6. 地区独立性とテスト境界 (District & Test Boundary)

1. **District Provisioning AI の書込境界**:
   - 書込可能領域は `data/**`、`CNAME`、`data/config.js` 等の不可避な地区固有データ・設定のみとする。
   - **`tests/**` は書込禁止（不可侵）** とする。新地区展開のために共通テストスイートの書き換えが必要になった場合は、個別の回避コードを追加してはならず、**Universal Gap** として HARD STOP し、共通契約改定として扱う。
2. **Universal Engine（`active/**`）の完全不可侵**:
   - `active/**` は全地区共通の Universal Engine であり、いかなる理由があっても地区固有コード・分岐・名称を混入させてはならない。差分は常に 0 バイトでなければならない。
