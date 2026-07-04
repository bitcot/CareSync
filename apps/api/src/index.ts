import express from 'express';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT ?? 4000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API listening on :${PORT}`);
  });
}

export default app;
