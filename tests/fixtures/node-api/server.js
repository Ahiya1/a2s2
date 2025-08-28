const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/api/todos", (req, res) => {
  res.json([
    { id: 1, text: "Learn Node.js", completed: true },
    { id: 2, text: "Build an API", completed: false },
  ]);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
