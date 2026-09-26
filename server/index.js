import { app, prepare } from "./app.js";
await prepare();
const port = Number(process.env.PORT) || 3000;
app.listen(port, () =>
  console.log(`SSC Weakness Finder: http://localhost:${port}`),
);
