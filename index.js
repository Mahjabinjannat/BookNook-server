import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";

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
app.post("/add-book", async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      totalCopies,
      image,
      description,
      userName,
      userEmail,
    } = req.body;

    // VALIDATE REQUIRED FIELDS
    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof author !== "string" ||
      !author.trim() ||
      !["Fiction", "Science", "History", "Kids", "Others"].includes(category) ||
      typeof image !== "string" ||
      !/^https?:\/\//.test(image) ||
      typeof description !== "string" ||
      !description.trim() ||
      typeof userName !== "string" ||
      !userName.trim() ||
      typeof userEmail !== "string" ||
      !userEmail.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing book information",
      });
    }

    // VALIDATE TOTAL COPIES
    if (!Number.isInteger(totalCopies) || totalCopies < 1) {
      return res.status(400).json({
        success: false,
        message: "Total copies is required and must be a positive whole number",
      });
    }

    // PREPARE BOOK DATA
    const newBook = {
      title: title.trim(),
      author: author.trim(),
      category,
      totalCopies,
      image,
      description: description.trim(),
      userName: userName.trim(),
      userEmail: userEmail.trim(),
      createdAt: new Date(),
    };

    // INSERT INTO MONGODB
    const result = await booksCollection.insertOne(newBook);

    console.log("Book inserted:", result.insertedId);

    // SEND SUCCESS RESPONSE
    res.status(201).json({
      success: true,
      message: "Book added successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Error adding book:", error);

    res.status(500).json({
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

app.get("/books/:id", async (req, res) => {
  const { id } = req.params;
  const result = await booksCollection.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

app.get("/my-books", async (req, res) => {
  try {
    const email = req.query.email;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const books = await booksCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      books,
    });
  } catch (error) {
    console.error("Error fetching books:", error);

    res.status(500).json({
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
app.patch("/my-books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid book ID",
      });
    }

    const result = await booksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    res.json({
      success: true,
      message: "Book updated successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to update book",
    });
  }
});

app.delete("/my-books/:id", async (req, res) => {
  const { id } = req.params;
  const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// ====================================
// BORROW BOOK API
// ====================================

app.post("/borrows", async (req, res) => {
  try {
    const { bookId, userName, userEmail } = req.body;

    if (
      !ObjectId.isValid(bookId) ||
      typeof userName !== "string" ||
      !userName.trim() ||
      typeof userEmail !== "string" ||
      !userEmail.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid borrowing information",
      });
    }

    const email = userEmail.trim().toLowerCase();
    const bookObjectId = new ObjectId(bookId);

    // Check whether the user already borrowed this book
    const existingBorrow = await borrowsCollection.findOne({
      bookId: bookObjectId,
      userEmail: email,
      status: "borrowed",
    });

    if (existingBorrow) {
      return res.status(409).json({
        success: false,
        message: "You have already borrowed this book",
      });
    }

    // Decrease copies only if at least one copy is available
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
        message: "Book not found or no copies available",
      });
    }

    // Borrow date and return date
    const borrowDate = new Date();

    const returnDate = new Date(borrowDate);
    returnDate.setUTCDate(returnDate.getUTCDate() + 7);

    const newBorrow = {
      bookId: bookObjectId,
      userName: userName.trim(),
      userEmail: email,
      borrowDate,
      returnDate,
      status: "borrowed",
    };

    // Save borrowing information
    try {
      const result = await borrowsCollection.insertOne(newBorrow);

      res.status(201).json({
        success: true,
        message: "Book borrowed successfully",
        insertedId: result.insertedId,
      });
    } catch (error) {
      // Restore the copy if saving the borrow fails
      await booksCollection.updateOne(
        { _id: bookObjectId },
        { $inc: { totalCopies: 1 } },
      );

      throw error;
    }
  } catch (error) {
    console.error("Error borrowing book:", error);

    res.status(500).json({
      success: false,
      message: "Failed to borrow book",
    });
  }
});

// ====================================
// CHECK IF USER ALREADY BORROWED BOOK
// ====================================

app.get("/borrows/check", async (req, res) => {
  try {
    const { bookId, email } = req.query;

    if (
      typeof bookId !== "string" ||
      !ObjectId.isValid(bookId) ||
      typeof email !== "string" ||
      !email.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid book ID and email are required",
      });
    }

    const existingBorrow = await borrowsCollection.findOne({
      bookId: new ObjectId(bookId),
      userEmail: email.trim().toLowerCase(),
      status: "borrowed",
    });

    res.json({
      success: true,
      alreadyBorrowed: !!existingBorrow,
    });
  } catch (error) {
    console.error("Error checking borrowing status:", error);

    res.status(500).json({
      success: false,
      message: "Failed to check borrowing status",
    });
  }
});

// ====================================
// GET MY BORROWED BOOKS
// ====================================

app.get("/my-borrows", async (req, res) => {
  try {
    const { email } = req.query;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const borrows = await borrowsCollection
      .aggregate([
        {
          $match: {
            userEmail: email.trim().toLowerCase(),
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
            title: "$book.title",
            image: "$book.image",
            author: "$book.author",
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

    res.json({
      success: true,
      borrows,
    });
  } catch (error) {
    console.error("Error fetching borrowed books:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch borrowed books",
    });
  }
});

// ====================================
// RETURN A BORROWED BOOK
// ====================================

app.patch("/borrows/:id/return", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid borrow ID",
      });
    }

    const borrowId = new ObjectId(id);

    const borrow = await borrowsCollection.findOne({
      _id: borrowId,
      status: "borrowed",
    });

    if (!borrow) {
      return res.status(404).json({
        success: false,
        message: "Active borrowing record not found",
      });
    }

    // Mark the book as returned
    const result = await borrowsCollection.updateOne(
      {
        _id: borrowId,
        status: "borrowed",
      },
      {
        $set: {
          status: "returned",
          returnedAt: new Date(),
        },
      },
    );

    if (result.modifiedCount === 0) {
      return res.status(409).json({
        success: false,
        message: "Book has already been returned",
      });
    }

    // Increase available copies
    await booksCollection.updateOne(
      { _id: borrow.bookId },
      {
        $inc: { totalCopies: 1 },
      },
    );

    res.json({
      success: true,
      message: "Book returned successfully",
    });
  } catch (error) {
    console.error("Error returning book:", error);

    res.status(500).json({
      success: false,
      message: "Failed to return book",
    });
  }
});

app.listen(PORT, () => {
  console.log(`BookNook server listening on port ${PORT}`);
});
