export interface Env {
  NCBI_API_KEY: string;
  NCBI_TOOL: string;
  NCBI_EMAIL: string;
}

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const ID_CONVERTER_BASE = "https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function ncbiParams(env: Env): string {
  return `api_key=${env.NCBI_API_KEY}&tool=${env.NCBI_TOOL}&email=${encodeURIComponent(env.NCBI_EMAIL)}`;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// GET /search?q=<query>&n=<20|50>
async function handleSearch(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams.get("q");
  const n = Math.min(parseInt(url.searchParams.get("n") ?? "20"), 50);

  if (!q) return errorResponse("q parameter is required");

  // Step 1: esearch → PMIDリスト取得
  const searchUrl =
    `${NCBI_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(q)}` +
    `&retmax=${n}&retmode=json&${ncbiParams(env)}`;

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) return errorResponse("NCBI search failed", 502);

  const searchData = (await searchRes.json()) as {
    esearchresult: { count: string; idlist: string[] };
  };

  const { count, idlist } = searchData.esearchresult;
  if (idlist.length === 0) return jsonResponse({ total: parseInt(count), results: [] });

  // Step 2: esummary → タイトル・著者・雑誌・出版年取得
  const summaryUrl =
    `${NCBI_BASE}/esummary.fcgi?db=pubmed&id=${idlist.join(",")}` +
    `&retmode=json&${ncbiParams(env)}`;

  const summaryRes = await fetch(summaryUrl);
  if (!summaryRes.ok) return errorResponse("NCBI summary failed", 502);

  const summaryData = (await summaryRes.json()) as {
    result: Record<string, {
      uid: string;
      title: string;
      authors: { name: string }[];
      fulljournalname: string;
      pubdate: string;
    }>;
  };

  const results = idlist
    .filter((id) => summaryData.result[id])
    .map((id) => {
      const item = summaryData.result[id];
      return {
        pmid: item.uid,
        title: item.title,
        authors: (item.authors ?? []).map((a) => a.name),
        journal: item.fulljournalname,
        year: item.pubdate?.substring(0, 4) ?? "",
      };
    });

  return jsonResponse({ total: parseInt(count), results });
}

// GET /abstract?pmid=<pmid>
async function handleAbstract(url: URL, env: Env): Promise<Response> {
  const pmid = url.searchParams.get("pmid");
  if (!pmid) return errorResponse("pmid parameter is required");

  const fetchUrl =
    `${NCBI_BASE}/efetch.fcgi?db=pubmed&id=${pmid}` +
    `&rettype=abstract&retmode=xml&${ncbiParams(env)}`;

  const res = await fetch(fetchUrl);
  if (!res.ok) return errorResponse("NCBI fetch failed", 502);

  const xml = await res.text();

  // タイトルと抄録をXMLからテキスト抽出
  const titleMatch = xml.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
  const abstractMatch = xml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g);

  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";
  const abstract = abstractMatch
    ? abstractMatch
        .map((block) => block.replace(/<[^>]+>/g, "").trim())
        .join(" ")
    : "";

  if (!title && !abstract) return errorResponse("Abstract not found", 404);

  return jsonResponse({ pmid, title, abstract });
}

// GET /convert?doi=<doi>
async function handleConvert(url: URL, env: Env): Promise<Response> {
  const doi = url.searchParams.get("doi");
  if (!doi) return errorResponse("doi parameter is required");

  const convertUrl = `${ID_CONVERTER_BASE}/?ids=${encodeURIComponent(doi)}&format=json`;
  const res = await fetch(convertUrl);
  if (!res.ok) return errorResponse("ID conversion failed", 502);

  const data = (await res.json()) as {
    records?: { pmid?: string; doi?: string }[];
  };

  const record = data.records?.[0];
  if (!record?.pmid) return errorResponse("PMID not found for this DOI", 404);

  return jsonResponse({ pmid: record.pmid, doi: record.doi ?? doi });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // OPTIONSプリフライト
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return errorResponse("Method not allowed", 405);
    }

    const url = new URL(request.url);

    switch (url.pathname) {
      case "/search":
        return handleSearch(url, env);
      case "/abstract":
        return handleAbstract(url, env);
      case "/convert":
        return handleConvert(url, env);
      default:
        return errorResponse("Not found", 404);
    }
  },
};
