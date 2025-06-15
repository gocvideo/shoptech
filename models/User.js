const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    googleId: {
        type: String
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String
    },
    // --- TRƯỜNG MỚI ĐƯỢC THÊM VÀO ---
    balance: {
        type: Number,
        required: true,
        default: 0 // Mặc định số dư của người dùng mới là 0
    }
});

const User = mongoose.model('user', userSchema);
module.exports = User;
