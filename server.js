const express = require('express');
const oracledb = require('oracledb');
const cors = require('cors');
const NodeCache = require('node-cache');

const cache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const app = express();

const allowedOrigins = [
  'https://frontend-code-srs-rules.vercel.app', // ❌ FIXED: Remove `/rule`
  'http://localhost:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

app.post('/rule', async (req, res) => {
  const { name, dbCreds } = req.body || {};

  if (!name || !dbCreds) {
    return res.status(400).json({ status: 'Invalid request: name or dbCreds missing' });
  }

  const { username, password, host, port, serviceName } = dbCreds;

  if (!username || !password || !host || !port || !serviceName) {
    return res.status(400).json({ status: 'Invalid DB credentials' });
  }

  const cacheKey = `${username}@${host}:${port}/${serviceName}:${name}`;
  const cachedData = cache.get(cacheKey);

  if (cachedData) {
    return res.json({ ...cachedData });
  }

  const connectString = `${host}:${port}/${serviceName}`;
  let connection;

  try {
    console.log('Connecting to DB with:', connectString);
    connection = await oracledb.getConnection({
      user: username,
      password: password,
      connectString,
    });

    const result = await connection.execute(
      `SELECT * FROM SRS_RULES WHERE RULE_NAME = :name`,
      [name],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const response = result.rows.length > 0
      ? result.rows[0]
      : { status: 'Not Configured in DB' };

    cache.set(cacheKey, response);

    res.json(response);
  } catch (err) {
    console.error('DB error:', err); // Log actual DB error
    res.status(500).json({ status: 'DB error', error: err.message });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {
        console.error('Error closing connection:', closeErr);
      }
    }
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
