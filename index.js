
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import verifySession from "./middlewares/verifySession.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

app.use(
  cors({
    origin: frontendUrl,
    credentials: true,
  })
);

app.use(express.json());

// MongoDB connection
const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db(process.env.DB_NAME);

const booksCollection = db.collection("books");
const borrowsCollection = db.collection("borrows");
const reviewsCollection = db.collection("reviews");

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

const allowedCategories = [
  "Fiction",
  "Science",
  "History",
  "Kids",
  "Others",
];

// Serve uploaded images
app.use("/uploads", express.static(uploadDir));

// ==========================================
// BASIC ROUTES
// ==========================================

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

// ==========================================
// IMAGE UPLOAD API
// ==========================================

// Login required
app.post(
  "/upload",
  verifySession,
  upload.single("image"),
  (req, res) => {
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
  }
);

// ==========================================
// BOOKS API
// ==========================================

// Get all books - Public
app.get("/books", async (req, res) => {
  try {
    const books = await booksCollection
      .find({})
      .sort({ addedAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: "Books fetched successfully!",
      books,
    });
  } catch (error) {
    console.error("Get books error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch books.",
    });
  }
});

// Get latest 6 books - Public
app.get("/books/latest", async (req, res) => {
  try {
    const latestBooks = await booksCollection
      .find({})
      .sort({ addedAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({
      success: true,
      message: "Latest 6 books fetched successfully!",
      books: latestBooks,
    });
  } catch (error) {
    console.error("Get latest books error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch latest books.",
    });
  }
});

// Get a single book by ID - Public
app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Book fetched successfully!",
      book,
    });
  } catch (error) {
    console.error("Get book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch book.",
    });
  }
});

// Add a new book - Login required
app.post("/books", verifySession, async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      image,
      description,
      totalCopies,
    } = req.body;

    if (
      typeof title !== "string" ||
      typeof author !== "string" ||
      typeof image !== "string" ||
      typeof description !== "string" ||
      !title.trim() ||
      !author.trim() ||
      !image.trim() ||
      !description.trim() ||
      !category
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required book information.",
      });
    }

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

    // User information comes from verified session
    const newBook = {
      title: title.trim(),
      author: author.trim(),
      category,
      image: image.trim(),
      description: description.trim(),
      contributorName: req.user.name,
      contributorEmail: req.user.email.toLowerCase(),
      totalCopies: copies,
      availableCopies: copies,
      addedAt: new Date(),
    };

    const result = await booksCollection.insertOne(newBook);

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

// Update a book - Owner only
app.patch("/books/:id", verifySession, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const {
      title,
      author,
      category,
      image,
      description,
      totalCopies,
    } = req.body;

    if (
      typeof title !== "string" ||
      typeof author !== "string" ||
      typeof image !== "string" ||
      typeof description !== "string" ||
      !title.trim() ||
      !author.trim() ||
      !image.trim() ||
      !description.trim() ||
      !category ||
      totalCopies === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required book information.",
      });
    }

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

    const bookId = new ObjectId(id);
    const userEmail = req.user.email.toLowerCase();

    // Verify book ownership
    const existingBook = await booksCollection.findOne({
      _id: bookId,
      contributorEmail: userEmail,
    });

    if (!existingBook) {
      return res.status(404).json({
        success: false,
        message: "Book not found or you are not allowed to update it.",
      });
    }

    const borrowedCopies =
      existingBook.totalCopies - existingBook.availableCopies;

    if (copies < borrowedCopies) {
      return res.status(400).json({
        success: false,
        message: `At least ${borrowedCopies} copies are currently borrowed.`,
      });
    }

    const updatedBook = {
      title: title.trim(),
      author: author.trim(),
      category,
      image: image.trim(),
      description: description.trim(),
      totalCopies: copies,
      availableCopies: copies - borrowedCopies,
      updatedAt: new Date(),
    };

    await booksCollection.updateOne(
      {
        _id: bookId,
        contributorEmail: userEmail,
      },
      {
        $set: updatedBook,
      }
    );

    const book = await booksCollection.findOne({
      _id: bookId,
    });

    res.status(200).json({
      success: true,
      message: "Book updated successfully!",
      book,
    });
  } catch (error) {
    console.error("Update book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update book.",
    });
  }
});

// Delete a book - Owner only
app.delete("/books/:id", verifySession, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const bookId = new ObjectId(id);
    const userEmail = req.user.email.toLowerCase();

    const existingBook = await booksCollection.findOne({
      _id: bookId,
      contributorEmail: userEmail,
    });

    if (!existingBook) {
      return res.status(404).json({
        success: false,
        message: "Book not found or access denied.",
      });
    }

    // Do not delete a book that has active borrows
    const activeBorrows = await borrowsCollection.countDocuments({
      bookId,
    });

    if (activeBorrows > 0) {
      return res.status(400).json({
        success: false,
        message: "This book cannot be deleted while it has active borrow records.",
      });
    }

    await booksCollection.deleteOne({
      _id: bookId,
      contributorEmail: userEmail,
    });

    res.status(200).json({
      success: true,
      message: "Book deleted successfully!",
    });
  } catch (error) {
    console.error("Delete book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete book.",
    });
  }
});

// ==========================================
// BORROWS API
// ==========================================

// Borrow a book - Login required
app.post("/borrows", verifySession, async (req, res) => {
  try {
    const {
      bookId,
      borrowDate,
      returnDate,
    } = req.body;

    if (!bookId || !borrowDate || !returnDate) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required borrow information.",
      });
    }

    if (!ObjectId.isValid(bookId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const borrowedAt = new Date(borrowDate);
    const returnedAt = new Date(returnDate);

    if (
      Number.isNaN(borrowedAt.getTime()) ||
      Number.isNaN(returnedAt.getTime()) ||
      returnedAt <= borrowedAt
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid borrow and return dates.",
      });
    }

    const bookObjectId = new ObjectId(bookId);
    const userEmail = req.user.email.toLowerCase();

    // Decrease available copies only when a copy is available
    const updateResult = await booksCollection.updateOne(
      {
        _id: bookObjectId,
        availableCopies: { $gt: 0 },
      },
      {
        $inc: { availableCopies: -1 },
      }
    );

    if (updateResult.modifiedCount === 0) {
      const book = await booksCollection.findOne({
        _id: bookObjectId,
      });

      if (!book) {
        return res.status(404).json({
          success: false,
          message: "Book not found.",
        });
      }

      return res.status(400).json({
        success: false,
        message: "No copies are currently available.",
      });
    }

    const book = await booksCollection.findOne({
      _id: bookObjectId,
    });

    const borrowData = {
      bookId: bookObjectId,
      bookTitle: book.title,
      bookImage: book.image,
      userEmail,
      borrowDate: borrowedAt,
      returnDate: returnedAt,
    };

    try {
      const result = await borrowsCollection.insertOne(borrowData);

      return res.status(201).json({
        success: true,
        message: "Book borrowed successfully!",
        borrow: {
          _id: result.insertedId,
          ...borrowData,
        },
      });
    } catch (insertError) {
      // Restore copy if borrow insertion fails
      await booksCollection.updateOne(
        { _id: bookObjectId },
        { $inc: { availableCopies: 1 } }
      );

      throw insertError;
    }
  } catch (error) {
    console.error("Borrow book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to borrow book.",
    });
  }
});

// Get current user's borrows - Login required
app.get("/borrows", verifySession, async (req, res) => {
  try {
    const borrows = await borrowsCollection
      .find({
        userEmail: req.user.email.toLowerCase(),
      })
      .sort({ borrowDate: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: "Borrow records fetched successfully!",
      borrows,
    });
  } catch (error) {
    console.error("Get borrows error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch borrow records.",
    });
  }
});

// Return borrowed book - Owner only
app.delete("/borrows/:id", verifySession, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid borrow ID.",
      });
    }

    const borrowId = new ObjectId(id);
    const userEmail = req.user.email.toLowerCase();

    // Atomically delete only the logged-in user's borrow record
    const borrow = await borrowsCollection.findOneAndDelete({
      _id: borrowId,
      userEmail,
    });

    if (!borrow) {
      return res.status(404).json({
        success: false,
        message: "Borrow record not found or access denied.",
      });
    }

    await booksCollection.updateOne(
      { _id: new ObjectId(borrow.bookId) },
      { $inc: { availableCopies: 1 } }
    );

    res.status(200).json({
      success: true,
      message: "Book returned successfully!",
    });
  } catch (error) {
    console.error("Return book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to return book.",
    });
  }
});

// ==========================================
// REVIEWS API
// ==========================================
// Get all reviews - Public
app.get("/reviews", async (req, res) => {
  try {
    const reviews = await reviewsCollection
      .find(
        {},
        {
          projection: {
            userEmail: 0,
          },
        }
      )
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: "Reviews fetched successfully!",
      reviews,
    });
  } catch (error) {
    console.error("Get reviews error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch reviews.",
    });
  }
});
// Check if the logged-in user has already reviewed
app.get("/reviews/me", verifySession, async (req, res) => {
  try {
    const email = req.user.email?.trim().toLowerCase();

    if (!email) {
      return res.status(401).json({
        success: false,
        message: "User email not found!",
      });
    }

    const review = await reviewsCollection.findOne(
      { userEmail: email },
      { projection: { _id: 1 } }
    );

    res.status(200).json({
      success: true,
      hasReviewed: Boolean(review),
    });
  } catch (error) {
    console.error("Check review error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to check review status!",
    });
  }
});

// Add review - Login required
app.post("/reviews", verifySession, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (
      rating === undefined ||
      typeof comment !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide rating and comment.",
      });
    }

    // Identity comes from verified session
    const name = req.user.name?.trim();
    const email = req.user.email?.trim().toLowerCase();
    const userImage = req.user.image || "";
    const reviewComment = comment.trim();

    if (!name || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Your account name must be between 1 and 100 characters.",
      });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account email address.",
      });
    }

    const reviewRating = Number(rating);

    if (
      !Number.isInteger(reviewRating) ||
      reviewRating < 1 ||
      reviewRating > 5
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5.",
      });
    }

    if (
      reviewComment.length < 10 ||
      reviewComment.length > 500
    ) {
      return res.status(400).json({
        success: false,
        message: "Review must be between 10 and 500 characters.",
      });
    }

    const newReview = {
      userName: name,
      userEmail: email,
      userImage,
      rating: reviewRating,
      comment: reviewComment,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await reviewsCollection.insertOne(newReview);

    res.status(201).json({
      success: true,
      message: "Review submitted successfully!",
      review: {
        _id: result.insertedId,
        ...newReview,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted a review.",
      });
    }

    console.error("Add review error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to submit review.",
    });
  }
});

// ==========================================
// ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {
  console.error("Request error:", error);

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message:
        error.code === "LIMIT_FILE_SIZE"
          ? "Image size must be 5 MB or less."
          : error.message,
    });
  }

  res.status(400).json({
    success: false,
    message: error.message || "Something went wrong.",
  });
});

// ==========================================
// START SERVER
// ==========================================

async function startServer() {
  try {
    if (!process.env.MONGODB_URI || !process.env.DB_NAME) {
      throw new Error("MONGODB_URI and DB_NAME must be configured.");
    }

    await client.connect();

    console.log("MongoDB connected successfully!");

    // One review per user email
    await reviewsCollection.createIndex(
      { userEmail: 1 },
      { unique: true }
    );

    console.log("Review unique index created successfully!");

    app.listen(port, () => {
      console.log(`BookNook server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
