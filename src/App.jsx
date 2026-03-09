export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const API_KEY = process.env.ODDS_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      error: 'ODDS_API_KEY não configurada',
      help: 'Vá em Vercel → Settings → Environment Variables e adicione ODDS_API_KEY'
    });
  }

  // Parâmetros configuráveis via query string
  const sport = req.query.sport || 'soccer_brazil_serie_a';
  const regions = req.query.regions || 'br,eu,uk,us';
  const markets = req.query.markets || 'h2h,spreads,totals';
  const oddsFormat = req.query.oddsFormat || 'decimal';

  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}&dateFormat=iso`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `Erro na API de odds: ${response.status}`,
        detail: errorText
      });
    }

    const data = await response.json();

    // Headers úteis da API (quota restante)
    const remaining = response.headers.get('x-requests-remaining');
    const used = response.headers.get('x-requests-used');

    return res.status(200).json({
      success: true,
      sport,
      count: data.length,
      quota: {
        remaining: remaining || 'N/A',
        used: used || 'N/A'
      },
      data
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Falha ao buscar odds em tempo real',
      detail: err.message
    });
  }
}
