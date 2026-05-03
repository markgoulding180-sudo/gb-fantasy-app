// Premier League Table API
// Returns mock table data (replace with real data source)

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Mock Premier League table data for 2025/26 season
    // In production, fetch from your database or external API
    const table = [
      { position: 1, name: 'Liverpool', played: 34, won: 26, drawn: 6, lost: 2, gf: 78, ga: 28, gd: 50, points: 84, form: ['W', 'W', 'D', 'W', 'W'] },
      { position: 2, name: 'Arsenal', played: 34, won: 24, drawn: 7, lost: 3, gf: 72, ga: 30, gd: 42, points: 79, form: ['W', 'D', 'W', 'W', 'D'] },
      { position: 3, name: 'Man City', played: 34, won: 22, drawn: 6, lost: 6, gf: 68, ga: 35, gd: 33, points: 72, form: ['W', 'W', 'L', 'W', 'W'] },
      { position: 4, name: 'Newcastle', played: 34, won: 20, drawn: 8, lost: 6, gf: 65, ga: 38, gd: 27, points: 68, form: ['W', 'W', 'W', 'D', 'W'] },
      { position: 5, name: 'Chelsea', played: 34, won: 18, drawn: 9, lost: 7, gf: 58, ga: 40, gd: 18, points: 63, form: ['D', 'W', 'W', 'L', 'W'] },
      { position: 6, name: 'Spurs', played: 34, won: 17, drawn: 7, lost: 10, gf: 62, ga: 48, gd: 14, points: 58, form: ['W', 'L', 'W', 'D', 'L'] },
      { position: 7, name: 'Aston Villa', played: 34, won: 16, drawn: 8, lost: 10, gf: 55, ga: 45, gd: 10, points: 56, form: ['D', 'W', 'L', 'W', 'W'] },
      { position: 8, name: 'Brighton', played: 34, won: 15, drawn: 9, lost: 10, gf: 52, ga: 46, gd: 6, points: 54, form: ['W', 'D', 'D', 'W', 'L'] },
      { position: 9, name: 'Man Utd', played: 34, won: 14, drawn: 8, lost: 12, gf: 48, ga: 50, gd: -2, points: 50, form: ['L', 'W', 'W', 'L', 'W'] },
      { position: 10, name: 'Fulham', played: 34, won: 13, drawn: 9, lost: 12, gf: 45, ga: 44, gd: 1, points: 48, form: ['D', 'L', 'W', 'W', 'D'] },
      { position: 11, name: 'Brentford', played: 34, won: 12, drawn: 8, lost: 14, gf: 52, ga: 52, gd: 0, points: 44, form: ['W', 'W', 'L', 'D', 'L'] },
      { position: 12, name: 'Crystal Palace', played: 34, won: 11, drawn: 10, lost: 13, gf: 42, ga: 48, gd: -6, points: 43, form: ['D', 'D', 'W', 'L', 'W'] },
      { position: 13, name: 'West Ham', played: 34, won: 11, drawn: 9, lost: 14, gf: 45, ga: 55, gd: -10, points: 42, form: ['L', 'D', 'L', 'W', 'D'] },
      { position: 14, name: 'Everton', played: 34, won: 10, drawn: 10, lost: 14, gf: 38, ga: 48, gd: -10, points: 40, form: ['W', 'L', 'D', 'D', 'L'] },
      { position: 15, name: 'Bournemouth', played: 34, won: 10, drawn: 8, lost: 16, gf: 42, ga: 58, gd: -16, points: 38, form: ['L', 'W', 'L', 'D', 'W'] },
      { position: 16, name: 'Wolves', played: 34, won: 9, drawn: 9, lost: 16, gf: 40, ga: 56, gd: -16, points: 36, form: ['D', 'L', 'D', 'W', 'L'] },
      { position: 17, name: "Nott'm Forest", played: 34, won: 8, drawn: 10, lost: 16, gf: 35, ga: 52, gd: -17, points: 34, form: ['L', 'D', 'W', 'L', 'D'] },
      { position: 18, name: 'Leeds', played: 34, won: 7, drawn: 8, lost: 19, gf: 38, ga: 65, gd: -27, points: 29, form: ['L', 'L', 'D', 'L', 'W'] },
      { position: 19, name: 'Burnley', played: 34, won: 6, drawn: 7, lost: 21, gf: 32, ga: 68, gd: -36, points: 25, form: ['L', 'L', 'L', 'W', 'L'] },
      { position: 20, name: 'Sunderland', played: 34, won: 5, drawn: 6, lost: 23, gf: 28, ga: 72, gd: -44, points: 21, form: ['L', 'L', 'L', 'L', 'D'] }
    ];
    
    // Calculate stats
    const totalMatches = table.reduce((sum, t) => sum + t.played, 0) / 2;
    const totalGoals = table.reduce((sum, t) => sum + t.gf, 0);
    const avgGoals = totalMatches > 0 ? (totalGoals / totalMatches).toFixed(1) : '0';
    
    res.status(200).json({
      table,
      stats: {
        totalMatches: Math.floor(totalMatches),
        totalGoals,
        avgGoals,
        currentGameweek: 35
      },
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Table API error:', error);
    res.status(500).json({ error: 'Failed to load table data' });
  }
}