---
name: h-app-auth-boundary
description: POSTING MAP Hアプリの認証境界を維持するための共通セキュリティプロトコル。起動用パブリックAPIと認証必須APIを明確に分離し、他地区展開時の認証境界逸脱を防止する。
---

# Skill: Hアプリ認証境界プロトコル v1

## 目的

POSTING MAP Hアプリにおける「起動時の可用性」と「重要データ・書き込みAPIの認証保護」を両立するため、GASバックエンドの認証境界を地区横断で統一する。

このSkillは、OKAYAMA-02で実証された認証境界を基準実装として、MIE-03等の他地区へ展開する際にも同じ境界を維持するために使用する。

## 絶対ルール

### 1. 無認証で許可するAPI (Public Bootstrap)

HアプリのOptimistic Loadおよび初期表示基盤のため、LINE/LIFF認証完了前に以下のPublic APIのみ無認証アクセスを許可する。

- `getMapsApiKey`
- `getTier1`

この2つ以外（および端末検証等の公開診断API）を「起動のため」という理由で無認証許可してはならない。

### 2. Dual-Audience 業務データ読取API (認証必須)

組織の進捗や在庫、ランキング等の業務データ読取APIは、有効な `dashboardSessionToken` または有効な `liffToken` を必須とする。

- `getSystemSummary`
- `getRanking`
- `getFlyerStock`
- `getGlobalPinStatus`
- `getLatestDistribution`
- `getDeliveryStats`
- `getAreaDetails`
- `getBulletinPosts`

※ Hアプリでは `liff.isLoggedIn()` 成立直後に有効な `liffToken` 付きで `fetchSystemSummary()` を非同期発火するため、全面無認証化する必要はない（SEC-001 / API_CONTRACT.md §6）。

### 3. Identity Bootstrap API (LIFF認証済み・名簿未確定)

LINE認証済みだが名簿照合（Identity確定）前に必要な専用API。

- `getStaffIdentity`
- `registerStaff`

有効な `liffToken` を必須とし、名簿確定（`_identityVerified`）を待たずに実行する。

### 4. Write API (配布員書き込み・認証＆名簿登録必須)

以下を含む業務Write APIは、有効な `liffToken` ＋ 名簿登録済み（`found === true` / `_identityVerified === true`）を必須とする。

- `updateRecordWithGPSPhoto`
- `submitDistribution`
- `updateFlyerStock`
- `requestFlyerTransfer`
- `resolveTransferRequest`
- `createBulletinPost`
- `sendBulletinContact`

※ `setPinInProgress` の境界整合:
Current Backend（`v2_api.js`）では有効な LINE 認証（`liffToken`）を必須とするが、Staff Master 認可（`resolveStaffIdentity` による名簿照合）は実行しない。Client 側（`app.js`）において `waitForIdentityVerified()` を待機して送信し、ローカル整合性を担保する。Backend 仕様に存在しない「Active Staff 必須」を断定しない。

### 5. Provisioning APIは別の保護境界を維持する

Provisioning系APIについては `verifyProvisioningToken` による保護を維持し、Hアプリの公開Bootstrap APIとは混同しない。

### 6. Manager認証とHアプリ認証を混同しない

PC ManagerがLIFF tokenを持たないことを理由として、HアプリAPI全体の認証を緩和してはならない。Managerの閲覧認証は、管理者専用認証機構（セッショントークン）として独立して保護する。

### 7. 認証境界の変更でHアプリのOptimistic Loadを壊さない

HアプリはLINE認証完了を待たずに画面骨格・起動基盤情報を先行取得する設計である。
そのため、`getMapsApiKey` と `getTier1` を認証必須へ変更する「全面認証化」は禁止する。

## 実装原則

`v2_api.js` 等のAPIディスパッチャでは、公開Bootstrap APIを明示的なホワイトリストとして扱う。

概念例:

```javascript
const isPublicAction = [
  'getMapsApiKey',
  'getTier1',
  'registerOrValidateDevice',
  'getDeviceStatus',
  'verifyManagerPassword'
].includes(action);
```

- `isPublicAction === true`: tokenなしでも処理を許可
- `isDualAuthAction === true`: dashboardSessionToken または liffToken を必須化
- Write / staffDependent: 有効な liffToken ＋ 名簿登録済みを必須化

## 必須検証ゲート

デプロイ前に最低限、次の2方向を機械的に確認する。

### 可用性ゲート

無認証で:

- `getMapsApiKey` → `success: true`
- `getTier1` → `success: true`

### 機密性・完全性ゲート

無認証で:

- `getSystemSummary` → `success: false` / `code: "UNAUTHORIZED"`
- `getRoster` → `success: false` / `code: "UNAUTHORIZED"`
- `updateRecordWithGPSPhoto` → `success: false` / `code: "UNAUTHORIZED"`

HTTP statusだけで判定せず、GASが返すJSONの `success` と `code` / `message` を確認する。

## HアプリRuntime確認

認証境界変更後は、Hアプリ実機相当環境で最低限以下を確認する。

- 全体件数が `0/0` のまま凍結していない
- 実データの総数・完了数が表示される
- Google Maps JavaScript SDKがロードされる
- マップコンテナが生成される
- マップが正常描画される

## 他地区展開時の扱い

他地区へ展開する場合、このSkillの認証境界を基準として実装・監査する。
分類が不明なAPIを無認証ホワイトリストへ追加してはならない。

## 禁止事項

- Read API全体を無認証化する
- Dashboard APIを包括的に無認証化する
- Manager対応のためHアプリAPI認証を緩和する
- `getRoster` 等の重要データAPIをBootstrap扱いする
- HTTP 200だけを根拠に認証テストをPASSとする
- 実機Runtime確認なしに「マップ復旧」を宣言する
