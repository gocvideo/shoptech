const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const orderSchema = new Schema({
    orderId: {
        type: String,
        required: true,
        unique: true,
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'user',
        required: true,
    },
    productName: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    customerEmail: {
        type: String,
    },
    // --- TRƯỜNG MỚI ĐỂ QUẢN LÝ TRẠNG THÁI ĐƠN HÀNG ---
    status: {
        type: String,
        enum: ['Đang đợi duyệt', 'Đang thực hiện', 'Đã hoàn thành', 'Đã hủy'],
        default: 'Đang đợi duyệt', // Trạng thái mặc định khi tạo đơn
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

const Order = mongoose.model('order', orderSchema);
module.exports = Order;
