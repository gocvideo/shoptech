const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * @typedef {Object} Deposit
 * @property {mongoose.Types.ObjectId} userId - ID của người dùng thực hiện nạp tiền.
 * @property {number} amount - Số tiền yêu cầu nạp.
 * @property {string} status - Trạng thái của giao dịch ('pending' hoặc 'completed').
 * @property {string} confirmationToken - Một mã duy nhất để xác nhận giao dịch qua email.
 * @property {Date} createdAt - Thời gian tạo yêu cầu.
 */
const depositSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending',
    },
    confirmationToken: {
        type: String,
        required: true,
        unique: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const Deposit = mongoose.model('deposit', depositSchema);
module.exports = Deposit;
