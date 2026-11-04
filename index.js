import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
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

app.listen(PORT, () => {
  console.log(`BookNook server listening on port ${PORT}`);
});
