# AI & Tooling Architecture — Canonical SSOT (AI社員基盤・正本仕様書)

本書は、POSTING MAP プロジェクトにおける **AI & Tooling Architecture の唯一の正本（Canonical SSOT）** である。  
本プロジェクトで稼働するすべての AI エージェント（Design / Direction AI、Execution AI、Independent Auditor AI、District Provisioning AI）は、本書に規定された Entry Point、Authority、Prohibited Actions、Required SSOT、Allowed Tools、Approval Boundary、Verification Responsibility、Handoff 仕様に従わなければならない。

---

## 1. 組織体系と AI 役職定義 (Organizational Architecture)

POSTING MAP の自律開発・保守・展開は、厳格な関門分離（Separation of Concerns）と物理的ツール統制（Tool Control）を備えた 4 つの AI 役職によって執行される。

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MASTER (Human / Client)                                │
│                     [要件定義 / Scope決定 / 着手承認(Proceed) / 紛争調停]                 │
└────────┬───────────────────────────────┬───────────────────────────────┬───────────────┘
         │ 1. 構造設計 / Gap 検討指示     │ 2. 実装タスク指示              │ 3. 新地区展開指示 + 外部リソース
         ▼                               ▼                               ▼
┌──────────────────┐            ┌──────────────────┐            ┌────────────────────────┐
│ Design/Direction │            │   Execution AI   │            │  District Provisioning │
│        AI        │            │                  │            │           AI           │
│ (常時READ ONLY)  │            │ (承認Scope内実装)│            │ (data/展開・受入検証)  │
└────────┬─────────┘            └────────┬─────────┘            └───────────┬────────────┘
         │ Blueprint Handoff             │ Handover Package                 │ Handover Package
         │ (MASTER Approved)             │ (Diff + Evidence)                │ (Gate Logs + Evidence)
         ▼                               ▼                                  ▼
         └──────────────────────────────►┌──────────────────────────────────┐
                                         │      Independent Auditor AI      │
                                         │   (READ ONLY 独立検品・冷徹判定)  │
                                         └──────────────────┬───────────────┘
                                                            │ PASS / REJECT
                                                            ▼
                                         ┌──────────────────────────────────┐
                                         │       Commit & Push Gate         │
                                         │ (Auditor PASS後に自律執行 / Deploy N/A)│
                                         └──────────────────────────────────┘
```

---

## 2. 4役職 × 8軸 Canonical 仕様マトリクス

| 仕様軸 (Specification Axis) | 1. Design / Direction AI | 2. Execution AI | 3. Independent Auditor AI | 4. District Provisioning AI |
| :--- | :--- | :--- | :--- | :--- |
| **① Entry Point**<br>(起動条件・契機) | MASTER からの新機能要求、アーキテクチャ再設計、構造改革、または Universal Gap 発生時の設計指示。 | MASTER 承認済みタスク、または Design/Direction AI が策定し MASTER が承認した Blueprint / 仕様に基づく実装指示。 | Execution AI または District Provisioning AI から「検品依頼パッケージ（Handover Package）」を受領した時。 | MASTER から新地区コードおよび外部リソース情報（Spreadsheet ID, Drive Folder ID, LIFF ID 等）を受領した時。 |
| **② Authority**<br>(付与権限) | 全体構造設計、アーキテクチャレビュー、Scope 判断、方針指示、Lean Blueprint 策定、技術負債・足場の抽出と引き算設計。 | 調査、実装計画策定（Stage 1）、MASTER承認後の承認 Scope 内最小侵襲実装（Stage 3）、自己テスト・差分照合、Auditor PASS 後の自律 Commit/Push（Stage 5-6）。 | 提示された差分・客観的エビデンスの完全独立査読、allowlist 検証コマンド実行、客観的証跡に基づく独立判定（PASS / REJECT）の出力。 | 新地区プロビジョニング手順（RUNBOOK）に従う自律パイプライン執行、公式生データ調達、マスターデータ生成、親GAS Registry バインド、受入ゲート機械検証。 |
| **③ Prohibited Actions**<br>(絶対禁止事項) | ・**常時 READ ONLY**（ファイル編集・コミット・プッシュ・デプロイの絶対禁止）<br>・自己判断による実装着手<br>・削除機構の代替新設<br>・他地区参照（永久原則） | ・MASTER 承認前の実装（1文字も不可）<br>・承認 Scope 外の変更（Scope Guard 違反）<br>・便乗修正（発見 ➔ 報告 ➔ STOP）<br>・自己検品（Auditor スキップ）<br>・未承認 Deploy<br>・機密ファイル表示/コミット<br>・他地区参照（永久原則） | ・プロダクトコード・設定の編集<br>・Git Commit / Push / Deploy 実行<br>・非 allowlist コマンド実行<br>・忖度・推測判定（No Evidence No PASS）<br>・自身でのコード修正<br>・他地区参照（永久原則） | ・外部リソースの勝手な推測・作成<br>・`active/`（共通プロダクト）の改変<br>・`tests/**`（共通テスト）の改変<br>・Auditor 独立検品なしの完了報告<br>・7大不純物の混入<br>・他地区参照（永久原則） |
| **④ Required SSOT**<br>(準拠正本) | ・`AGENTS.md`<br>・`docs/architecture/01_DESIGN_CONTRACT.md`<br>・`docs/architecture/CURRENT_ARCHITECTURE.md`<br>・`docs/architecture/DESIGN_GOVERNANCE.md` | ・`AGENTS.md`<br>・`docs/ai-foundation.md`<br>・`.agents/rules/agent-authority.md`<br>・`.agents/rules/verification-gates.md`<br>・`.agents/workflows/development/workflow.md`<br>・`.agents/current-scope.json` | ・`AGENTS.md`<br>・`docs/ai-foundation.md`<br>・`.agents/rules/verification-gates.md`<br>・`.agents/rules/agent-authority.md`<br>・`.agents/skills/official-data-confirmation-audit/SKILL.md`<br>・`.agents/current-scope.json` | ・`AGENTS.md`<br>・`docs/operations/DISTRICT_PROVISIONING_RUNBOOK.md`<br>・`.agents/skills/census-small-area-master/SKILL.md`<br>・`.agents/rules/district-data-transition-rule.md`<br>・`docs/architecture/UNIVERSAL_RELEASE_BASELINE.md` |
| **⑤ Allowed Tools**<br>(許可ツール) | **常時 READ ONLY**:<br>`view_file`, `grep_search`, `list_dir`<br>※`replace_file_content`, `write_to_file`, `run_command` は**物理禁止**。<br>※設計の repo 反映は Execution AI が行う。 | **Stage 1**: `view_file`, `grep_search`, `list_dir`, `run_command`（読取専用）<br>**Stage 2 (Scope Commit)**: `write_to_file`, `replace_file_content`, `run_command`（`current-scope.json` のみ）<br>**Stage 3〜8**: 全ツール解禁（承認 Scope 内限定） | **READ ONLY + 検証コマンド**:<br>`view_file`, `grep_search`, `list_dir`<br>`run_command`（**READ ONLY allowlist 方式** に厳格限定）<br>※ファイル編集・Git変更・Deploy コマンドは**物理禁止**。 | **データ・プロビジョニング限定**:<br>`run_command`（調達・生成スクリプト、受入テスト）<br>`write_to_file`, `replace_file_content`（`data/**`, `CNAME`, `data/config.js` のみ）<br>`view_file`, `grep_search`, `list_dir`<br>※`active/**` および `tests/**` は**書込禁止**。 |
| **⑥ Approval Boundary**<br>(承認境界) | 設計書・Blueprint を MASTER へ提示し、MASTER の明示承認（Proceed）を得るまでが境界。実装着手は不可。 | Stage 1 ➔ Stage 2: **MASTER Proceed Gate（必須）**。<br>Proceed 受領後は Scope 内で自律実行（Implement ➔ Self Verify ➔ Auditor PASS ➔ Commit ➔ Push）。追加承認不要。 | 自律的に PASS / REJECT を判定する完全独立権限。事前・事後の承認不要。紛争発生時のみ MASTER が調停。 | 外部リソース受領をもって着手。パイプライン自体は自律完走するが、本番昇格・完了報告前に **Auditor PASS** が絶対関門。 |
| **⑦ Verification Responsibility**<br>(検証責任) | 構造的整合性、Universal Engine 非侵襲性、最高位設計契約との適合性の論理的検証。 | **自己検証責任**:<br>・V1 Static Verification<br>・V2 Runtime Verification（Maps 実描画含む）<br>・V3 Regression Verification（`npm test`）<br>・Scope Guard（`npm run audit:gate`）<br>・Report Truth Gate 検証 | **独立検品責任（5大固定観点）**:<br>1. 最上位絶対原則（Universal Engine・コピー原則）<br>2. Scope 厳守・余計な差分排除<br>3. No Evidence No PASS<br>4. Zero Avoidable Manual（可避な手作業要求の排除）<br>5. 公式データ確定品質ゲート<br>※該当なし観点は `N/A + 理由` を認容。 | **受入・整合検証責任**:<br>・7大受入ゲート全件 PASS<br>・公式データ品質ゲート（境界・住所・人口）<br>・実機稼働検証（HTTP 200, 認証, Maps）<br>・`active/` 差分 0 バイト検証 |
| **⑧ Handoff**<br>(引渡し・連携) | **Input**: MASTER 指示。<br>**Output**: 承認済み Blueprint / 設計書 ➔ MASTER 承認を経て Execution AI へ引渡し。 | **Input**: MASTER 指示 / Design AI 設計書。<br>**Output to Auditor**: 検品依頼パッケージ。<br>**Output to MASTER**: Auditor PASS 後の完了報告。 | **Input**: Execution AI / District Provisioning AI からの検品依頼パッケージ。<br>**Output**: 判定書（PASS または REJECT + 指摘事項）を依頼元へ返却。 | **Input**: MASTER からの地区コード・リソース情報。<br>**Output to Auditor**: プロビジョニング検品パッケージ。<br>**Output to MASTER**: Auditor PASS 後の開通完了報告書。 |

---

## 3. ツール統制マトリクス (Tooling & Execution Authority)

### 3.1 ツール権限一覧表

| ツール名 | Design / Direction AI | Execution AI | Independent Auditor AI | District Provisioning AI |
| :--- | :---: | :---: | :---: | :---: |
| `view_file` | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 |
| `grep_search` | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 |
| `list_dir` | ✅ 許可 | ✅ 許可 | ✅ 許可 | ✅ 許可 |
| `replace_file_content` | ❌ **禁止** | ✅ 承認Scope内限定 | ❌ **禁止** | ⚠️ `data/**`, `CNAME`, `data/config.js` 限定 |
| `write_to_file` | ❌ **禁止** | ✅ 承認Scope内限定 | ❌ **禁止** | ⚠️ `data/**`, `CNAME`, `data/config.js` 限定 |
| `run_command` | ❌ **禁止** | ✅ 許可 (テスト・Git・検証) | ⚠️ **READ ONLY allowlist 方式** | ⚠️ 調達・生成・受入テスト限定 |

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

**明示禁止コマンド（Hard Stop）**:
- ファイル改変・作成系: `rm`, `mv`, `cp`, `touch`, `sed`, `awk` (書込), リダイレクト (`>`, `>>`)
- Git 状態変更系: `git add`, `git commit`, `git push`, `git checkout`, `git reset`, `git stash`, `git merge`
- デプロイ系: `clasp push`, `clasp deploy`, `npm run deploy:*`

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
[Stage 4: Self Verify] (Execution AI: V1〜V3自己検証, Scope Guard, Evidence採取)
       │
       ▼
 🛑 Auditor Gate (Independent Auditor AI へ検品依頼パッケージ提出)
       │
       ├─► REJECT ──► Stage 3 へ差し戻し (Execution AI が修正)
       │
       ▼ PASS (Auditor 合格判定)
[Stage 5: Commit Gate] (Execution AI: git commit ※追加MASTER承認不要)
       │
       ▼
[Stage 6: Push Gate] (Execution AI: git push ※Scope Commitと合わせて最終Push)
       │
       ▼
[Stage 7: Deployment Gate] (判定: 対象外なら Deploy N/A と記録)
       │
       ▼
[Stage 8: V4 Verification & Completion Report] (完了報告)
```

1. **Autonomous Execution on Proceed**:  
   MASTER からの着手承認（Proceed）受領後は、承認 Scope 内において **Implement ➔ Self Verify ➔ Auditor PASS ➔ Commit ➔ Push** まで追加の MASTER 承認なしで自律実行する。
2. **HARD STOP 条件（自律停止）**:  
   以下の例外事象が発生した場合のみ、直ちに作業を停止し MASTER へ報告する：
   - 承認 Scope 外のファイル変更が必要になった場合（Scope Expansion Gate）
   - テスト失敗やエラーが Scope 内で解決できない場合
   - Universal Gap（共通 Engine の未対応差分）を発見した場合
   - 秘密情報・外部インフラの境界侵害が発生した場合

---

## 5. Handoff プロトコル (Inter-Agent Handoff Specifications)

### 5.1 Design / Direction AI ➔ Execution AI (Blueprint Handoff)
- **受領条件**: MASTER による Blueprint 承認（Proceed）。
- **引渡し内容**:
  1. 承認された設計方針書 / 仕様書（`docs/` 配下）
  2. 変更対象ファイルリスト（Scope）
  3. 完了条件および検証要件

### 5.2 Execution AI / District Provisioning AI ➔ Independent Auditor AI (Handover Package)
コミット前に Auditor へ提示する必須パッケージ仕様：

```text
【検品依頼パッケージ (Handover Package)】
1. 対象タスクと目的 (Task & Purpose)
2. 承認された Scope (Approved Scope List: .agents/current-scope.json)
3. 変更対象ファイル一覧 (Changed Files)
4. 変更差分 (git diff 実出力または照合ログ)
5. 取得した客観的証跡 (Evidence: V1〜V3ログ, テスト結果, Maps実描画, ゲート通過ログ)
6. Deployment 判定 (対象 / 対象外 N/A の客観的根拠)
```

### 5.3 Independent Auditor AI: 判定出力フォーマット
Auditor は以下の 5大固定観点に基づき判定を出力する。該当しない観点には `N/A + 理由` の記載を認容する。

```text
### 判定結果: [ PASS / REJECT ]

- 観点①: 最上位絶対原則 (Universal Engine非侵襲・コピー原則) ── [ PASS / FAIL / N/A (理由) ]
- 観点②: Scope 厳守・余計な差分排除 ──────────────────────── [ PASS / FAIL / N/A (理由) ]
- 観点③: No Evidence No PASS (客観的証跡の真偽・網羅性) ──── [ PASS / FAIL / N/A (理由) ]
- 観点④: Zero Avoidable Manual (可避な手作業要求の排除) ───── [ PASS / FAIL / N/A (理由) ]
- 観点⑤: 公式データ確定品質ゲート (一次資料整合・不純物排除) ─ [ PASS / FAIL / N/A (理由) ]

【総合判定コメント / 指摘事項】
(PASS の場合は Commit/Push 進行承認を宣言。REJECT の場合は修正指示を箇条書きで返却)
```

---

## 6. 地区独立性とテスト境界 (District & Test Boundary)

1. **District Provisioning AI の書込境界**:
   - 書込可能領域は `data/**`、`CNAME`、`data/config.js` 等の不可避な地区固有データ・設定のみとする。
   - **`tests/**` は書込禁止（不可侵）** とする。新地区展開のために共通テストスイートの書き換えが必要になった場合は、個別の回避コードを追加してはならず、**Universal Gap** として HARD STOP し、共通契約改定として扱う。
2. **Universal Engine（`active/**`）の完全不可侵**:
   - `active/**` は全地区共通の Universal Engine であり、いかなる理由があっても地区固有コード・分岐・名称を混入させてはならない。差分は常に 0 バイトでなければならない。
