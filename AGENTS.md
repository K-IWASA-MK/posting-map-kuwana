# POSTING MAP — AGENTS.md (基本就業規則)

## 1. Architecture — ABSOLUTE

- POSTING MAP is a standalone application and a standalone repository.
- Each district is an independent application and repository.
- active/ = district-agnostic universal engine. Never modify active/ for district specialization.
- data/ = district-specific data and client configuration (address_master.csv, boundaries.geojson, municipality_master.csv, config.js, area_mapping.json).
- Spreadsheet = Pure DB. No scripts allowed inside.
- GAS = Standalone only.
- Container-bound Apps Script is NOT part of the current architecture. Never create, restore, synchronize, or depend on it.
- District identity comes dynamically from Spreadsheet name and data/. Never hardcode district names, IDs, or endpoints in active/.

## 2. District Independence & Repository Boundary — ABSOLUTE

- Each district must operate 100% independently.
- A new district is created by copying Universal POSTING MAP and replacing data/.
- No cross-district repository, branch, code, data, or runtime dependency.
- All production resources (Spreadsheet, GAS, Drive, LIFF) are strictly isolated per district.

### リポジトリ境界・他地区参照禁止【永久原則】
- 現在作業対象としているリポジトリのGit rootを作業・探索・検索・読み取り・操作の絶対境界とする。
- SSD上に存在する他地区（OKAYAMA-02、KUWANA等）のリポジトリやフォルダーを、通常時・監査時・実装時・比較時を問わず参照・探索・検索・読み取りしない。
- 「参考」「比較」「検証」の目的でも他リポジトリを見ない。
- 他リポジトリのコード、データ、設定、Git履歴、監査結果、Runtime情報等を判断材料に使用しない。
- リポジトリ内部だけでは判断できない事項は、他地区を見て補完・推測せず UNDETERMINED とする。
- 「アクセスできる」と「参照してよい」は別であり、現在のリポジトリ以外はAIエージェントにとって存在しないものとして扱う。
- 複数リポジトリを同時に参照しない。

## 3. Execution — ABSOLUTE

- No Plan → No Proceed → No Implementation.
- Never expand scope without approval.
- Discover unexpected conditions → Report → STOP.
- Never claim PASS without objective evidence.

### 編集に関する絶対遵守ルール（Violations are strictly prohibited）

1. **指示対象外コードの不可侵**
   明示的に指定されたファイル・関数・ブロック・行以外への変更は一切禁止する。
   「ついで」のリファクタリング、不要な型定義変更、命名規則の修正、
   コメント削除・整理、フォーマット変更、関連箇所の改善などもすべて違反とする。

2. **差分の事前明示（No Silent Changes）**
   ファイルを変更する前に、必ず以下を日本語で宣言すること。
   - 対象ファイル
   - 対象関数・ブロック・行
   - 変更内容
   - 変更理由
   - 変更しない範囲

   宣言されていない変更を実施してはならない。

3. **最小侵襲の原則**
   目的を達成するために必要な最小限の行数・最小限のコードのみを変更すること。
   より良い実装、将来の拡張性、コード整理、共通化などを理由として
   変更範囲を自主的に拡大してはならない。

4. **追加改善の勝手な実装禁止**
   実装中に、指定範囲外に改善・修正・リファクタリングが必要または有益だと判断した場合でも、
   勝手に実装してはならない。
   必要と判断した内容は「追加提案」として報告し、明示的な承認を得てから実装すること。

5. **実装後の差分照合必須**
   実装完了後、必ず Git の差分を確認し、
   「事前に宣言した変更範囲」と「実際の変更内容」を照合すること。

6. **宣言外の変更を検出した場合は失敗扱い**
   事前宣言にない変更が1箇所でも存在した場合、
   その実装を正常完了として報告してはならない。
   直ちに停止し、以下を報告すること。
   - 宣言外の変更ファイル
   - 変更箇所
   - 変更内容
   - なぜ発生したか

   自己判断で追加修正・リファクタリング・別箇所の改善を行ってはならない。

7. **変更範囲外への波及禁止**
   「関連している」「同じデータを使用している」「一緒に直した方が安全」
   「将来必要になる」などの理由だけで、指定されていない画面・関数・ファイルへ
   変更を波及させてはならない。

8. **Commit / Push / Deploy 前の最終確認**
   commit、push、GAS本番deploy等を行う前に、
   実際の Git diff が実装指示および事前宣言と一致していることを確認すること。
   一致しない場合は commit / push / deploy を禁止する。

## 4. Data Protection

- Never modify production data outside approved scope.
- Never delete production resources without explicit approval.
- Preserve rollback until final verification passes.

## 5. Completion

- Implementation → Test → Diff/Audit → Commit → Push → Deploy → Runtime Verify.
- If any required verification FAILS: STOP.
- Git PASS is not deployment PASS.
- Production deployment requires production runtime evidence.

## 6. Detailed Rules & Workflows

AI社員は作業フェーズに応じて、必ず以下の詳細規程・ワークフローを参照・遵守すること。

- 現行アーキテクチャ定義: [docs/architecture/CURRENT_ARCHITECTURE.md](docs/architecture/CURRENT_ARCHITECTURE.md)
- 開発・完了報告手順: [.agents/workflows/development/workflow.md](.agents/workflows/development/workflow.md)
- 検証・検品規程 & HARD STOP条件: [.agents/rules/verification-gates.md](.agents/rules/verification-gates.md)
- 権限境界・Scope最小化・禁止事項: [.agents/rules/agent-authority.md](.agents/rules/agent-authority.md)
- 新地区展開ワークフロー: [.agents/workflows/district-deployment/workflow.md](.agents/workflows/district-deployment/workflow.md)
- AI社員基盤・アーキテクチャ体系: [docs/ai-foundation.md](docs/ai-foundation.md)
