# Backup & Restore Runbook (バックアップおよび障害復旧手順書)

- **Version**: 1.0.0
- **Status**: OFFICIAL STANDARD (SSOT)
- **Target**: Universal POSTING MAP Engine v1.0
- **Supreme Authority**: [AGENTS.md](file:///Volumes/SSD_DATA/posting-map-universal/AGENTS.md)
- **Security Baseline**: [SECURITY_BASELINE.md](file:///Volumes/SSD_DATA/posting-map-universal/docs/security/SECURITY_BASELINE.md)
- **Data Lifecycle**: [DATA_LIFECYCLE.md](file:///Volumes/SSD_DATA/posting-map-universal/docs/data/DATA_LIFECYCLE.md)

---

## 1. 目的と基本方針

本書は、Universal POSTING MAP におけるデータ損失、スプレッドシート破損、誤操作、インフラ障害等のインシデントから迅速・確実にデータを復旧するための **バックアップおよびリストア運用手順（SSOT）** を規定する。

### 基本方針
1. **Pure DB の定期保全**:
   - 各地区の業務データ（配布実績、スタッフ名簿、在庫等）が蓄積される Google スプレッドシートを主要バックアップ対象とする。
2. **Secret の平文保存絶対禁止**:
   - Google Maps API Key、LINE Channel Secret、管理者PIN 等の機密情報は、**いかなるバックアップアーカイブにも平文で保存してはならない**。
3. **客観的指標の明記 (RPO / RTO)**:
   - 根拠のない目標復旧値は設定せず、現行インフラ（Google Drive / GAS）の制約を踏まえた現実的な指標を定義する（未確定事項は Decision Required と明記）。

---

## 2. 目標復旧指標 (RPO / RTO)

| 指標 | 定義 | 現行ベースライン / 状態 | 根拠・制約事項 |
|:---|:---|:---|:---|
| **RPO** (目標復旧時点) | 障害発生時に許容されるデータ消失期間 | **24時間以内** (日次バックアップ基準)<br>*※リアルタイム復旧は TBD / Decision Required* | Google Drive の自動バージョン履歴機能および日次スナップショットに依存 |
| **RTO** (目標復旧時間) | 障害発生からサービス再開までに要する時間 | **4時間以内** (単一地区障害時)<br>*※全地区同時復旧は TBD / Decision Required* | スプレッドシート差し替えおよび `DISTRICT_REGISTRY` 参照先更新の手動作業時間 |

> [!NOTE]
> 高頻度なリアルタイムバックアップ（例: 1時間ごとの外部エクスポート）や、RPO 1時間未満の短縮については、今後の Google Cloud Storage (GCS) 連携等のインフラ改修時に検討する（**Decision Required**）。

---

## 3. バックアップ対象と取得頻度

| 対象区分 | 対象リソース | バックアップ手法 | 取得頻度 | 保持期間 (Retention) | 保存先 |
|:---|:---|:---|:---:|:---:|:---|
| **業務データ (Pure DB)** | 各地区 Google スプレッドシート | Google Drive 版履歴 + 日次自動スナップショット複製 | 日次 (毎日未明) | 90日間 *(※正式期間は要意思決定)* | バックアップ専用 Drive フォルダ (隔離) |
| **構成メタデータ** | 親GAS `DISTRICT_REGISTRY`, Script Properties キー定義 | 設定エクスポートスクリプト (Secret値はマスク) | 変更時随時 + 週次 | 1年間 | Git (暗号化) または保護リポジトリ |
| **マスターデータ** | `data/` (住所・境界GeoJSON・自治体) | Git コミット履歴 | 変更時随時 | 永続 (Git) | GitHub リポジトリ |
| **監査証跡 (Audit)** | 配布完了タイムスタンプ、操作ログ | スプレッドシート内 `DISTRIBUTION_RECORDS` | リアルタイム | 契約期間中 + 1年間 | スプレッドシート DB |

> [!CAUTION]
> **Secret の除外原則**:
> `DISTRICT_REGISTRY` 内の ID やメタデータはバックアップ対象とするが、`GOOGLE_MAPS_API_KEY_<DISTRICT_ID>` 等の鍵実値はバックアップ対象外とする。鍵情報は GCP Console およびマスター機密保管庫（KMS / 1Password等）にて独立管理する。

---

## 4. バックアップ取得手順 (Daily Backup Procedure)

### 自動バックアップ（標準運用）
1. スケジュール実行スクリプト（GAS タイムトリガーまたは外部管理バッチ）が起動。
2. `DISTRICT_REGISTRY` に登録された有効地区のスプレッドシートIDを順次取得。
3. 各スプレッドシートを、指定のバックアップ専用 Drive フォルダ（一般配布員・外部権限完全遮断）へ複製コピー。
4. ファイル名規則: `BACKUP_<districtId>_YYYYMMDD_HHmmss`
5. コピー完了後、前述の保持期間（90日）を超過した古いバックアップファイルを自動パージ。

### 手動バックアップ（計画メンテナンス・大規模更新前）
```bash
# 計画変更前のスナップショット取得（管理コンソールまたは専用CLI）
# ※ 実行例: node scripts/backup-district-spreadsheet.js --district KUWANA
```
- **確認事項**: 複製されたスプレッドシートが正常に開き、レコード数が元ファイルと一致していること。

---

## 5. リストア（復旧）詳細手順 (Restore Procedure)

障害発生（スプレッドシート破損、行データの誤削除、Integrity Guard エラー等）時の復旧手順は以下の通り。

```text
[障害検知 & 地区一時停止 (SUSPENDED)]
       ↓
[復旧用バックアップファイルの選定]
       ↓
[スプレッドシート複製 & 整合性検証]
       ↓
[SYSTEM_INFO 及び 12シート構造の確認]
       ↓
[DISTRICT_REGISTRY の spreadsheetId 差替え]
       ↓
[API Smoke Test & 導通確認]
       ↓
[サービス再開 (ACTIVE)]
```

### ステップ詳細

1. **地区の一時停止 (Safety Suspension)**:
   - 二重書き込みや不整合拡大を防ぐため、親GASの `DISTRICT_REGISTRY` において当該地区の `enabled` を `false` に変更する。
2. **バックアップファイルの特定と検証**:
   - 障害発生直前の健全なバックアップスプレッドシート（`BACKUP_<districtId>_YYYYMMDD_HHmmss`）をバックアップフォルダから特定。
3. **本番用スプレッドシートの再配備**:
   - バックアップファイルを本番フォルダへ複製し、ファイル名を `POSTING_MAP_DB_<districtId>` に設定。
   - 新しいスプレッドシートID（`RESTORED_SPREADSHEET_ID`）を取得。
4. **Integrity Guard の確認**:
   - 複製したシートの `SYSTEM_INFO` を開き、`district_id` が対象地区と完全一致していることを確認。
   - コンテナバインドスクリプトが混入していないこと（Pure DB）を確認。
5. **DISTRICT_REGISTRY の参照先更新**:
   - 親GASの `DISTRICT_REGISTRY` を更新し、当該地区の `spreadsheetId` を `RESTORED_SPREADSHEET_ID` に差し替える。
   - `enabled` を `false` のまま（検証中）として保存。
6. **復旧検証 (Restore Verification)**:
   - 管理者権限で Dashboard にログインし、直近の実績データが正しく表示されるか確認。
   - API Smoke Test を実行し、データ取得・登録が正常に行われることを確認。
7. **サービス再開 (Re-activation)**:
   - `DISTRICT_REGISTRY` の `enabled` を `true` に戻し、`SYSTEM_INFO` の `active` を `TRUE` に設定。
   - 関係者へ復旧完了を通知。

---

## 6. リストア検証と定期訓練 (Restore Drill)

バックアップが確実に機能することを担保するため、以下の訓練・検証を定期実施する。

1. **リストア訓練頻度**:
   - 年2回（半期に1回）、検証用環境においてバックアップからの復旧訓練を実施する。
2. **訓練内容**:
   - バックアップスプレッドシートからテスト用地区（`TEST-DISTRICT`）を復旧し、H App および Dashboard からの疎通確認を完了させる。
3. **エビデンス記録**:
   - 訓練実施日、所要時間（実測RTO）、復旧データ件数、成否判定を記録・保管する。

---

## 7. 責任体制とエスカレーション (Escalation Path)

| ロール | 担当者 / 組織 | 責務 |
|:---|:---|:---|
| **Primary Owner** | システム運用責任者 (Site Reliability Engineer) | 日次バックアップ監視、障害検知、一次リストア作業の執行 |
| **Secondary Owner** | バックエンド開発リード | 整合性検証、`DISTRICT_REGISTRY` の安全な更新、トラブルシューティング |
| **Escalation Point** | プロジェクト最高責任者 (MASTER) | サービス停止判断、長期データ欠損時の意思決定、関係先への障害報告 |

- **エスカレーション基準**:
  - 障害検知から30分以内に原因特定または復旧手順に着手できない場合、直ちに MASTER へエスカレーションする。
