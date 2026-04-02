# pubmed-proxy

## 概要
NCBIのE-Utilities APIへのCORSプロキシWorker。
社内向けPubMed日本語検索ツールのバックエンドとして機能する。

## 重要ルール
- 実装前に必ずプランを提示し、承認を得てから実行する
- ファイルの削除は行わない
- push前に `npm run build` でビルドエラーがないことを確認する
- パッケージ追加時はGitHub Stars 1,000以上・直近3ヶ月以内に更新されたものに限定する

## プロジェクト構成
```
pubmed-proxy/
├── src/
│   └── index.ts       # メインWorkerコード
├── wrangler.toml      # Cloudflare設定
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

## 環境変数（すべてWrangler Secretで管理）
- `NCBI_API_KEY` : NCBIで取得したAPIキー
- `NCBI_TOOL`    : "pubmed-proxy"（固定）
- `NCBI_EMAIL`   : 開発者のメールアドレス

設定コマンド：
```bash
wrangler secret put NCBI_API_KEY
wrangler secret put NCBI_TOOL
wrangler secret put NCBI_EMAIL
```

## エンドポイント仕様

### GET /search
PubMedをキーワード検索し、タイトル・著者・雑誌・出版年を返す。

パラメータ：
- `q` : 検索キーワード（英語）※Claude APIで変換済みのものを受け取る
- `n` : 取得件数（20 or 50、デフォルト20）

レスポンス：
```json
{
  "total": 1234,
  "results": [
    {
      "pmid": "12345678",
      "title": "...",
      "authors": ["Smith J", "Tanaka K"],
      "journal": "Diabetes Care",
      "year": "2024"
    }
  ]
}
```

### GET /abstract
PMIDを指定して抄録の全文を取得する。

パラメータ：
- `pmid` : PubMed ID

レスポンス：
```json
{
  "pmid": "12345678",
  "title": "...",
  "abstract": "..."
}
```

### GET /convert
DOIをPMIDに変換する。

パラメータ：
- `doi` : DOI文字列

レスポンス：
```json
{
  "pmid": "12345678",
  "doi": "10.xxxx/xxxxx"
}
```

## CORSポリシー
全オリジン許可（`Access-Control-Allow-Origin: *`）。
社内限定ツールのため認証なし。

## NCBIリクエストルール
- すべてのリクエストに `api_key`・`tool`・`email` パラメータを付与すること
- レート上限：10リクエスト/秒（APIキーあり）
- ベースURL：`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`

## 使用するE-Utilitiesエンドポイント
| API | 用途 |
|---|---|
| `esearch.fcgi` | キーワード→PMID一覧取得 |
| `esummary.fcgi` | PMIDリスト→タイトル等サマリー取得 |
| `efetch.fcgi` | PMID→抄録フルテキスト取得 |
| PMC ID Converter | DOI→PMID変換 |

## デプロイ手順
```bash
npm install
npm run build          # エラーがないことを確認
wrangler deploy
```
