
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import verifyToken from "./middlewares/verifyToken.js";

dotenv.config();

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is not configured.");
}

if (!process.env.DB_NAME) {
  throw new Error("DB_NAME is not configured.");
}

if (!process.env.FRONTEND_URL) {
  throw new Error("FRONTEND_URL is not configured.");
}

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

/* ==========================================
   MONGODB CONNECTION
========================================== */

const client = new MongoClient(process.env.MONGODB_URI);

let db;
let connectionPromise;

async function connectToDatabase() {
  if (db) return db;

  if (!connectionPromise) {
    connectionPromise = client
      .connect()
      .then(() => {
        db = client.db(process.env.DB_NAME);
        console.log("MongoDB connected successfully!");
        return db;
      })
      .catch((error) => {
        connectionPromise = null;
        console.error("MongoDB connection error:", error);
        throw error;
      });
  }

  return connectionPromise;
}

// Connect to MongoDB before handling API requests.
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Database connection failed.",
    });
  }
});

/* ==========================================
   TEST ROUTES
========================================== */

// Server test
app.get("/", (req, res) => {
  res.send("BookNook Server is Running!");
});

// MongoDB connection test
app.get("/test-db", async (req, res) => {
  try {
    await db.command({ ping: 1 });

    res.status(200).send("MongoDB Connected Successfully!");
  } catch (error) {
    console.error("MongoDB connection error:", error);

    res.status(500).send("MongoDB Connection Failed!");
  }
});

/* ==========================================
   BOOKS API
========================================== */

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
    console.error("Get books error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch books",
    });
  }
});

// Get latest 6 books
app.get("/books/latest", async (req, res) => {
  try {
    const latestBooks = await db
      .collection("books")
      .find({})
      .sort({ addedAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({
      success: true,
      message: "Latest 6 books fetched successfully",
      books: latestBooks,
    });
  } catch (error) {
    console.error("Get latest books error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch latest books",
    });
  }
});

// Get a single book by ID
app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const book = await db.collection("books").findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Book fetched successfully",
      book,
    });
  } catch (error) {
    console.error("Get book error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch book",
    });
  }
});

// Add a new book
app.post("/books", verifyToken, async (req, res) => {
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

// Update a book
app.patch("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
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
      !title?.trim() ||
      !author?.trim() ||
      !category ||
      !image?.trim() ||
      !description?.trim() ||
      totalCopies === undefined
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

    const booksCollection = db.collection("books");
    const bookId = new ObjectId(id);

    const existingBook = await booksCollection.findOne({
      _id: bookId,
    });

    if (!existingBook) {
      return res.status(404).json({
        success: false,
        message: "Book not found.",
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
      { _id: bookId },
      { $set: updatedBook }
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

// Delete a book
app.delete("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const result = await db.collection("books").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found.",
      });
    }

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

/* ==========================================
   BORROWS API
========================================== */

// Borrow a book
app.post("/borrows", async (req, res) => {
  try {
    const {
      bookId,
      userEmail,
      borrowDate,
      returnDate,
    } = req.body;

    if (!bookId || !userEmail || !borrowDate || !returnDate) {
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

    const email = userEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address.",
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

    const booksCollection = db.collection("books");
    const borrowsCollection = db.collection("borrows");
    const bookObjectId = new ObjectId(bookId);

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
      userEmail: email,
      borrowDate: borrowedAt,
      returnDate: returnedAt,
    };

    try {
      const result = await borrowsCollection.insertOne(borrowData);

      res.status(201).json({
        success: true,
        message: "Book borrowed successfully!",
        borrow: {
          _id: result.insertedId,
          ...borrowData,
        },
      });
    } catch (insertError) {
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

// Get borrows of a user
app.get("/borrows", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "User email is required.",
      });
    }

    const userEmail = email.trim().toLowerCase();

    const borrows = await db
      .collection("borrows")
      .find({ userEmail })
      .sort({ borrowDate: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      message: "Borrow records fetched successfully.",
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

// Return a borrowed book
app.delete("/borrows/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid borrow ID.",
      });
    }

    const borrowsCollection = db.collection("borrows");
    const borrowId = new ObjectId(id);

    const borrow = await borrowsCollection.findOne({
      _id: borrowId,
    });

    if (!borrow) {
      return res.status(404).json({
        success: false,
        message: "Borrow record not found.",
      });
    }

    const deleteResult = await borrowsCollection.deleteOne({
      _id: borrowId,
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Borrow record not found.",
      });
    }

    await db.collection("books").updateOne(
      { _id: borrow.bookId },
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

/* ==========================================
   REVIEWS API
========================================== */

// Get all reviews
app.get("/reviews", async (req, res) => {
  try {
    const reviews = await db
      .collection("reviews")
      .find({})
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

// Get current user's review status
app.get("/reviews/me", verifyToken, async (req, res) => {
  try {
    const email = req.user.email?.trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "User email not found.",
      });
    }

    const review = await db.collection("reviews").findOne({
      userEmail: email,
    });

    res.status(200).json({
      success: true,
      hasReviewed: Boolean(review),
    });
  } catch (error) {
    console.error("Check review status error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to check review status.",
    });
  }
});

// Add a new review
app.post("/reviews", verifyToken, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    const userName = req.user.name?.trim();
    const userEmail = req.user.email?.trim().toLowerCase();
    const userImage = req.user.image || "";

    if (!userName || !userEmail) {
      return res.status(400).json({
        success: false,
        message: "User information is missing.",
      });
    }

    const reviewComment =
      typeof comment === "string" ? comment.trim() : "";

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

    const reviewsCollection = db.collection("reviews");

    const existingReview = await reviewsCollection.findOne({
      userEmail,
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted a review.",
      });
    }

    const newReview = {
      userName,
      userEmail,
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
    console.error("Add review error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to submit review.",
    });
  }
});

/* ==========================================
   ERROR HANDLER
========================================== */

app.use((error, req, res, next) => {
  console.error("Request error:", error);

  res.status(500).json({
    success: false,
    message: error.message || "Something went wrong.",
  });
});


export default app;
