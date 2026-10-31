
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
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

// Get a single book by ID
app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId
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

    // Validate required fields
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

    // Validate category
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

    // Validate total copies
    const copies = Number(totalCopies);

    if (!Number.isInteger(copies) || copies < 1) {
      return res.status(400).json({
        success: false,
        message: "Total copies must be at least 1.",
      });
    }

    const booksCollection = db.collection("books");
    const bookId = new ObjectId(id);

    // Find existing book
    const existingBook = await booksCollection.findOne({
      _id: bookId,
    });

    if (!existingBook) {
      return res.status(404).json({
        success: false,
        message: "Book not found.",
      });
    }

    // Calculate borrowed copies
    const borrowedCopies =
      existingBook.totalCopies - existingBook.availableCopies;

    if (copies < borrowedCopies) {
      return res.status(400).json({
        success: false,
        message: `At least ${borrowedCopies} copies are currently borrowed.`,
      });
    }

    // Updated book information
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

    // Update book in MongoDB
    await booksCollection.updateOne(
      { _id: bookId },
      { $set: updatedBook }
    );

    // Get updated book
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

// Borrow a book
app.post("/borrows", async (req, res) => {
  try {
    const {
      bookId,
      userEmail,
      borrowDate,
      returnDate,
    } = req.body;

    // Validate required fields
    if (!bookId || !userEmail || !borrowDate || !returnDate) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required borrow information.",
      });
    }

    // Validate book ID
    if (!ObjectId.isValid(bookId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID.",
      });
    }

    // Validate email
    const email = userEmail.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address.",
      });
    }

    // Validate dates
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

    // Decrease available copies only if a copy is available
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

    // Get book details
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

      return res.status(201).json({
        success: true,
        message: "Book borrowed successfully!",
        borrow: {
          _id: result.insertedId,
          ...borrowData,
        },
      });
    } catch (insertError) {
      // Restore available copy if borrow record could not be saved
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
      .find({
        userEmail,
      })
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

    // Validate borrow ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid borrow ID.",
      });
    }

    const borrowsCollection = db.collection("borrows");
    const borrowId = new ObjectId(id);

    // Find borrow record
    const borrow = await borrowsCollection.findOne({
      _id: borrowId,
    });

    if (!borrow) {
      return res.status(404).json({
        success: false,
        message: "Borrow record not found.",
      });
    }

    // Delete borrow record
    const deleteResult = await borrowsCollection.deleteOne({
      _id: borrowId,
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Borrow record not found.",
      });
    }

    // Increase available copies
    await db.collection("books").updateOne(
      {
        _id: new ObjectId(borrow.bookId),
      },
      {
        $inc: {
          availableCopies: 1,
        },
      }
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

startServer();
