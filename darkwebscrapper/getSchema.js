const mongoose = require('mongoose');
const Message = require('./model.js');

async function validateSchema() {
  try {
    await mongoose.connect('mongodb+srv://reignsreigns68:P1HX1gZFTrgNn9gi@genr-tele.f60nkdn.mongodb.net/');

    const testMessage = new Message({
      content: "This is a test message",
      Mid: Math.floor(Math.random() * 1000000) // Generate a random Mid to ensure uniqueness
    });

    await testMessage.save();
    console.log("Schema validation successful, document saved.");
  } catch (error) {
    console.error("Schema validation failed:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}
