
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// MongoDB connection
const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db(process.env.DB_NAME);

// Test route
app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});

// MongoDB connection test
app.get("/test-db", async (req, res) => {
  try {
    await db.command({ ping: 1 });

    res.send("MongoDB Connected Successfully!");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    res.status(500).send("MongoDB Connection Failed!");
  }
});

// Start server
async function startServer() {
  try {
    await client.connect();

    console.log("MongoDB connected successfully!");

    app.listen(port, () => {
      console.log(`BookNook server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  }
}

startServer();
