
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// MongoDB connection
const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db(process.env.DB_NAME);

// Upload directory
const uploadDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `${randomUUID()}${extension}`);
  },
});

// Only image files
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

// Serve uploaded images
app.use("/uploads", express.static(uploadDir));

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

// Image upload API
app.post("/upload", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select an image.",
      });
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;

    res.status(201).json({
      success: true,
      message: "Image uploaded successfully!",
      imageUrl,
    });
  } catch (error) {
    console.error("Image upload error:", error);

    res.status(500).json({
      success: false,
      message: "Image upload failed.",
    });
  }
});



// Multer error handler
app.use((error, req, res, next) => {
  res.status(400).json({
    success: false,
    message: error.message || "Something went wrong.",
  });
});

// Get all books
app.get("/books", async (req, res) => {
  try {
    const books = await db
      .collection("books")
      .find({})
      .sort({ addedAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: "Books fetched successfully",
      books,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch books",
    });
  }
});

// Add a new book
app.post("/books", async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      image,
      description,
      contributorName,
      contributorEmail,
      totalCopies,
    } = req.body;

    if (
      !title?.trim() ||
      !author?.trim() ||
      !category ||
      !image?.trim() ||
      !description?.trim() ||
      !contributorName?.trim() ||
      !contributorEmail?.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required book information.",
      });
    }

    const allowedCategories = [
      "Fiction",
      "Science",
      "History",
      "Kids",
      "Others",
    ];

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book category.",
      });
    }

    const copies = Number(totalCopies);

    if (!Number.isInteger(copies) || copies < 1) {
      return res.status(400).json({
        success: false,
        message: "Total copies must be at least 1.",
      });
    }

    const newBook = {
      title: title.trim(),
      author: author.trim(),
      category,
      image: image.trim(),
      description: description.trim(),
      contributorName: contributorName.trim(),
      contributorEmail: contributorEmail.trim().toLowerCase(),
      totalCopies: copies,
      availableCopies: copies,
      addedAt: new Date(),
    };

    const result = await db.collection("books").insertOne(newBook);

    res.status(201).json({
      success: true,
      message: "Book added successfully!",
      book: {
        _id: result.insertedId,
        ...newBook,
      },
    });
  } catch (error) {
    console.error("Add book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to add book.",
    });
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
