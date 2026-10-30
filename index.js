const express = require("express");
const cors = require("cors");

const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});

// Start server
app.listen(port, () => {
  console.log(`BookNook server running on port ${port}`);
});
