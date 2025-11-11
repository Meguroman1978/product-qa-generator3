# 🚀 完全デプロイガイド

このガイドでは、GitHubからVercelへの完全なデプロイ手順を説明します。

---

## 📋 前提条件

- GitHubアカウント
- Vercelアカウント（無料でOK）
- OpenAI APIキー（GPT-4o-mini使用可能なもの）
- Git（ローカルにインストール済み）

---

## 🔧 ステップ1: GitHubリポジトリの準備

### 1-1. 新規リポジトリ作成（初回のみ）

GitHubで新しいリポジトリを作成：
- リポジトリ名: `product-qa-generator4`（任意）
- 公開/非公開: どちらでもOK
- Initialize: チェックを入れない（空のリポジトリ）

### 1-2. ローカルにクローン

```bash
# GitHubリポジトリをクローン
git clone https://github.com/YOUR_USERNAME/product-qa-generator4.git
cd product-qa-generator4
```

---

## 📦 ステップ2: ファイルの配置

### 2-1. ZIPファイルを解凍

```bash
# ダウンロードしたZIPファイルを解凍
unzip ~/Downloads/product-qa-premium-v4.7-complete.zip
```

### 2-2. ファイルをルート直下に移動

```bash
# ファイルをルート直下に移動（重要！）
mv product-qa-premium-v4.7/* .
mv product-qa-premium-v4.7/.gitignore .

# 空のディレクトリを削除
rm -rf product-qa-premium-v4.7
```

### 2-3. ディレクトリ構造の確認

以下のようになっているか確認：

```
product-qa-generator4/
├── .git/
├── .gitignore
├── api/
│   ├── generate-qa.js
│   ├── crawl-with-browser.js
│   ├── puppeteer-crawler.js
│   ├── external-research.js
│   ├── download-pdf.js
│   ├── download-rtf.js
│   └── download-word.js
├── public/
│   └── index.html
├── vercel.json
├── package.json
├── README.md
├── CHANGELOG.md
└── DEPLOYMENT_GUIDE.md
```

**⚠️ 重要**: `product-qa-premium-v4.7/`という親ディレクトリが残っていないこと！

---

## 📤 ステップ3: GitHubにプッシュ

```bash
# すべてのファイルを追加
git add -A

# コミット
git commit -m "Deploy v4.7: Complete version with bug fixes"

# GitHubにプッシュ
git push origin main
```

---

## 🌐 ステップ4: Vercelデプロイ

### 4-1. Vercelにログイン

1. https://vercel.com にアクセス
2. 「Sign Up」または「Log In」
3. GitHubアカウントで認証

### 4-2. プロジェクト作成

1. ダッシュボードで「Add New...」→「Project」をクリック
2. GitHubリポジトリを検索: `product-qa-generator4`
3. 「Import」をクリック

### 4-3. プロジェクト設定

| 項目 | 設定値 |
|-----|-------|
| **Project Name** | `product-qa-generator4`（任意） |
| **Framework Preset** | Other（変更不要） |
| **Root Directory** | `./`（変更不要） |
| **Build Command** | （空欄のままでOK） |
| **Output Directory** | `public`（変更不要） |

### 4-4. 環境変数設定（オプション）

環境変数は不要です。OpenAI APIキーはフロントエンドで入力します。

### 4-5. デプロイ開始

1. 「Deploy」ボタンをクリック
2. デプロイが開始される（約1〜2分）
3. 「Congratulations!」が表示されたら完了

---

## ✅ ステップ5: 動作確認

### 5-1. アプリケーションにアクセス

Vercelが生成したURL（例: `https://product-qa-generator4.vercel.app`）にアクセス

### 5-2. 基本動作テスト

1. **ページ読み込み確認**
   - [ ] ページが正しく表示される
   - [ ] Q&A数で「指定しない（自動）」が選択されている

2. **URL入力モードテスト**
   - [ ] OpenAI APIキーを入力
   - [ ] kutsu.comのURLを入力
   - [ ] 「Q&A生成」ボタンをクリック
   - [ ] 進捗バーが表示される
   - [ ] Q&Aが生成される

3. **HTMLソースコードモードテスト**
   - [ ] 「HTMLソースコード入力」タブをクリック
   - [ ] タブが正しく切り替わる
   - [ ] HTMLソースコードを貼り付け
   - [ ] Q&Aが生成される

4. **ダウンロードテスト**
   - [ ] PDFダウンロードが動作する
   - [ ] RTFダウンロードが動作する

---

## 🔄 ステップ6: 更新デプロイ

ファイルを更新した場合：

```bash
# 変更をコミット
git add -A
git commit -m "Update: description of changes"
git push origin main
```

Vercelが自動的に再デプロイします（約1〜2分）。

---

## 🐛 トラブルシューティング

### エラー: "Build failed"

**原因**: `vercel.json`の設定が正しくない

**解決策**:
```json
{
  "functions": {
    "api/*.js": {
      "maxDuration": 60,
      "memory": 2048
    }
  }
}
```

### エラー: "Function not found"

**原因**: ディレクトリ構造が正しくない

**解決策**: 
- `api/`ディレクトリがルート直下にあるか確認
- 余分な親ディレクトリがないか確認

### エラー: "Q&A生成ボタンが反応しない"

**原因**: v4.6を使用している

**解決策**: v4.7を使用してください

### エラー: "Timeout"

**原因**: Q&A数が多すぎる、またはページが重い

**解決策**:
- Q&A数を「指定しない（自動）」に変更
- Q&A数を30問に減らす
- リソースタイプを「指定URLのみ」に変更
- Vercel Pro Planにアップグレード（$20/月）

---

## 📊 Vercel制限

### Hobby Plan（無料）
- 実行時間: **60秒**
- メモリ: **2048MB**
- 月間実行時間: **100時間**
- デプロイ数: 無制限

### Pro Plan（$20/月）
- 実行時間: **300秒**
- メモリ: **3008MB**
- 月間実行時間: **1000時間**
- デプロイ数: 無制限

### アップグレードが必要な場合

以下の場合、Pro Planへのアップグレードを検討：
- Q&A数を100問にしたい
- 複数の商品を連続処理したい
- タイムアウトエラーが頻発する

---

## 🔐 セキュリティ注意事項

### APIキーの取り扱い

- OpenAI APIキーはフロントエンドで入力
- ブラウザのローカルストレージに保存（暗号化なし）
- サーバーサイドでは処理しない
- ユーザーのブラウザから直接OpenAI APIに接続

### 推奨事項

- APIキーは使用量制限を設定
- 定期的にキーをローテーション
- 不要になったらローカルストレージをクリア

---

## 📝 カスタムドメイン設定（オプション）

### 独自ドメインの追加

1. Vercelダッシュボードでプロジェクトを開く
2. 「Settings」→「Domains」
3. ドメインを入力（例: `qa.example.com`）
4. DNSレコードを設定

詳細: https://vercel.com/docs/concepts/projects/domains

---

## 🆘 サポート

問題が発生した場合：
1. Vercelのログを確認（ダッシュボード→「Deployments」→最新デプロイ→「View Function Logs」）
2. ブラウザの開発者ツール（F12）でエラーを確認
3. このガイドのトラブルシューティングセクションを参照
4. GitHubリポジトリのIssuesで質問

---

**デプロイ成功を祈ります！** 🎉
