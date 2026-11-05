import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { verifyJWT } from "./middleware/verifyJWT.js";

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send({ message: "Server is running" });
});

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.error("MongoDB connection error:", err);
    throw err;
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("bookNook");
const booksCollection = db.collection("books");
const borrowsCollection = db.collection("borrows");

// ADD BOOK API
app.post("/add-book", verifyJWT, async (req, res) => {
  try {
    const { title, author, category, totalCopies, image, description } =
      req.body;

    const userEmail = req.user.email;
    const userName = req.user.name;

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof author !== "string" ||
      !author.trim() ||
      !["Fiction", "Science", "History", "Kids", "Others"].includes(category) ||
      typeof image !== "string" ||
      !/^https?:\/\//.test(image) ||
      typeof description !== "string" ||
      !description.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing book information",
      });
    }

    if (!Number.isInteger(totalCopies) || totalCopies < 1) {
      return res.status(400).json({
        success: false,
        message: "Total copies must be a positive whole number",
      });
    }

    const newBook = {
      title: title.trim(),
      author: author.trim(),
      category,
      totalCopies,
      image,
      description: description.trim(),
      userName,
      userEmail,
      createdAt: new Date(),
    };

    const result = await booksCollection.insertOne(newBook);

    return res.status(201).json({
      success: true,
      message: "Book added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error adding book:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add book",
    });
  }
});

app.get("/books", async (req, res) => {
  try {
    const result = await booksCollection.find().toArray();
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch books" });
  }
});

app.get("/books/new-arrivals", async (req, res) => {
  try {
    const books = await booksCollection
      .find()
      .sort({ createdAt: -1, _id: -1 })
      .limit(6)
      .toArray();

    res.json(books);
  } catch (error) {
    console.error("Error fetching new arrivals:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch new arrivals",
    });
  }
});

app.get("/books/:id", verifyJWT, async (req, res) => {
  const { id } = req.params;
  const result = await booksCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

app.get("/my-books", verifyJWT, async (req, res) => {
  try {
    const email = req.user.email;

    const books = await booksCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      success: true,
      books,
    });
  } catch (error) {
    console.error("Error fetching books:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch books",
    });
  }
});

// app.patch("/my-books/:id", async (req, res) => {
//   const { id } = req.params;
//   const upadatedData = req.body;
//   const result = await booksCollection.updateOne(
//     {
//       _id: new ObjectId(id),
//     },
//     {
//       $set: upadatedData,
//     },
//   );
//   res.json(result);
// });
app.patch("/my-books/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const allowedFields = [
      "title",
      "author",
      "category",
      "totalCopies",
      "description",
    ];

    const updatedData = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updatedData[field] = req.body[field];
      }
    }

    if (Object.keys(updatedData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided",
      });
    }

    for (const field of ["title", "author", "description"]) {
      if (field in updatedData) {
        if (
          typeof updatedData[field] !== "string" ||
          !updatedData[field].trim()
        ) {
          return res.status(400).json({
            success: false,
            message: `Invalid ${field}`,
          });
        }

        updatedData[field] = updatedData[field].trim();
      }
    }

    if (
      "category" in updatedData &&
      !["Fiction", "Science", "History", "Kids", "Others"].includes(
        updatedData.category,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid category",
      });
    }

    if (
      "totalCopies" in updatedData &&
      (!Number.isInteger(updatedData.totalCopies) ||
        updatedData.totalCopies < 1)
    ) {
      return res.status(400).json({
        success: false,
        message: "Total copies must be a positive whole number",
      });
    }

    const result = await booksCollection.updateOne(
      {
        _id: new ObjectId(id),
        userEmail: req.user.email,
      },
      {
        $set: updatedData,
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found or access denied",
      });
    }

    return res.json({
      success: true,
      message: "Book updated successfully",
    });
  } catch (error) {
    console.error("Error updating book:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update book",
    });
  }
});

app.delete("/my-books/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const result = await booksCollection.deleteOne({
      _id: new ObjectId(id),
      userEmail: req.user.email,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found or access denied",
      });
    }

    return res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: "Book deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting book:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete book",
    });
  }
});

/* ============================================
   BORROW SYSTEM
============================================ */

// POST /borrows
// Borrow a book
app.post("/borrows", verifyJWT, async (req, res) => {
  try {
    const { bookId } = req.body;

    const userEmail = req.user.email;
    const userName = req.user.name;

    if (!bookId || typeof bookId !== "string") {
      return res.status(400).json({
        success: false,
        message: "Book ID is required",
      });
    }

    if (!ObjectId.isValid(bookId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const bookObjectId = new ObjectId(bookId);

    const book = await booksCollection.findOne({
      _id: bookObjectId,
    });

    if (!book) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    const existingBorrow = await borrowsCollection.findOne({
      bookId: bookObjectId,
      userEmail,
      status: "borrowed",
    });

    if (existingBorrow) {
      return res.status(409).json({
        success: false,
        message: "You have already borrowed this book",
      });
    }

    const updateResult = await booksCollection.updateOne(
      {
        _id: bookObjectId,
        totalCopies: { $gt: 0 },
      },
      {
        $inc: { totalCopies: -1 },
      },
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: "This book is not available",
      });
    }

    const borrowDate = new Date();
    const returnDate = new Date(borrowDate);
    returnDate.setDate(returnDate.getDate() + 7);

    const borrowData = {
      bookId: bookObjectId,
      bookTitle: book.title,
      bookImage: book.image || "",
      userName,
      userEmail,
      borrowDate,
      returnDate,
      status: "borrowed",
    };

    try {
      const result = await borrowsCollection.insertOne(borrowData);

      return res.status(201).json({
        success: true,
        message: "Book borrowed successfully",
        insertedId: result.insertedId,
      });
    } catch (insertError) {
      await booksCollection.updateOne(
        { _id: bookObjectId },
        { $inc: { totalCopies: 1 } },
      );

      throw insertError;
    }
  } catch (error) {
    console.error("Borrow error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to borrow book",
    });
  }
});
/* ============================================
   CHECK BORROW STATUS
============================================ */

// GET /borrows/check?bookId=...&email=...
app.get("/borrows/check", verifyJWT, async (req, res) => {
  try {
    const { bookId } = req.query;

    const userEmail = req.user.email;

    if (
      typeof bookId !== "string" ||
      !ObjectId.isValid(bookId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid book ID is required",
      });
    }

    const existingBorrow = await borrowsCollection.findOne({
      bookId: new ObjectId(bookId),
      userEmail,
      status: "borrowed",
    });

    return res.json({
      success: true,
      alreadyBorrowed: Boolean(existingBorrow),
    });
  } catch (error) {
    console.error("Borrow check error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to check borrow status",
    });
  }
});

/* ============================================
   GET MY BORROWED BOOKS
============================================ */

// GET /borrows?email=...
app.get("/borrows", verifyJWT, async (req, res) => {
  try {
    const userEmail = req.user.email;

    const borrows = await borrowsCollection
      .aggregate([
        {
          $match: {
            userEmail,
            status: "borrowed",
          },
        },
        {
          $lookup: {
            from: "books",
            localField: "bookId",
            foreignField: "_id",
            as: "book",
          },
        },
        {
          $unwind: {
            path: "$book",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            title: {
              $ifNull: ["$bookTitle", "$book.title"],
            },
            image: {
              $ifNull: ["$bookImage", "$book.image"],
            },
            author: {
              $ifNull: ["$book.author", ""],
            },
          },
        },
        {
          $project: {
            book: 0,
          },
        },
        {
          $sort: {
            borrowDate: -1,
          },
        },
      ])
      .toArray();

    return res.json({
      success: true,
      borrows,
    });
  } catch (error) {
    console.error("Get borrows error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch borrowed books",
    });
  }
});

/* ============================================
   RETURN BORROWED BOOK
============================================ */

// DELETE /borrows/:id
app.delete("/borrows/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params;

    const userEmail = req.user.email;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid borrow ID",
      });
    }

    const borrowId = new ObjectId(id);

    // Find only the authenticated user's active borrow
    const borrow = await borrowsCollection.findOne({
      _id: borrowId,
      userEmail,
      status: "borrowed",
    });

    if (!borrow) {
      return res.status(404).json({
        success: false,
        message: "Active borrow record not found or access denied",
      });
    }

    // Conditionally mark this user's borrow as returned
    const updateResult = await borrowsCollection.updateOne(
      {
        _id: borrowId,
        userEmail,
        status: "borrowed",
      },
      {
        $set: {
          status: "returned",
          returnedAt: new Date(),
        },
      },
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(409).json({
        success: false,
        message: "Book has already been returned",
      });
    }

    // Restore the available copy
    const bookUpdateResult = await booksCollection.updateOne(
      {
        _id: borrow.bookId,
      },
      {
        $inc: {
          totalCopies: 1,
        },
      },
    );

    return res.json({
      success: true,
      message: "Book returned successfully",
    });
  } catch (error) {
    console.error("Return book error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to return book",
    });
  }
});

app.listen(PORT, () => {
  console.log(`BookNook server listening on port ${PORT}`);
});
