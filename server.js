require('dotenv').config();
const http = require('http'); // Import a module http
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const WebSocket = require('ws'); // Import the WebSocket library

const authRoutes = require('./routes/auth');
const User = require('./models/User');
const Order = require('./models/Order');
const Deposit = require('./models/Deposit');

require('./config/passport-setup');

const app = express();
const server = http.createServer(app); // Create an HTTP server from the Express app
const wss = new WebSocket.Server({ server }); // Create a WebSocket server attached to the HTTP server

const PORT = process.env.PORT || 3000;

// A Map to store active WebSocket connections for each user
const clients = new Map();

// WebSocket connection logic
wss.on('connection', (ws) => {
    console.log('Một client đã kết nối WebSocket');

    // When a message is received from the client
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // When the client registers with their userId, store the connection
            if (data.type === 'register' && data.userId) {
                clients.set(data.userId, ws);
                console.log(`Người dùng ${data.userId} đã đăng ký WebSocket.`);
            }
        } catch (error) {
            console.error('Lỗi xử lý tin nhắn WebSocket:', error);
        }
    });

    // When the connection is closed
    ws.on('close', () => {
        // Remove the client from our map
        for (let [userId, clientWs] of clients.entries()) {
            if (clientWs === ws) {
                clients.delete(userId);
                console.log(`Người dùng ${userId} đã ngắt kết nối WebSocket.`);
                break;
            }
        }
    });

    ws.on('error', (error) => {
        console.error('Lỗi WebSocket:', error);
    });
});

// Function to send a message to a specific user
function sendToUser(userId, data) {
    const userSocket = clients.get(userId.toString());
    if (userSocket && userSocket.readyState === WebSocket.OPEN) {
        userSocket.send(JSON.stringify(data));
    }
}

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }
});

app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// --- ROUTES ---
app.get('/', (req, res) => res.redirect('/shop/'));
app.use('/auth', authRoutes);
app.get('/profile', (req, res) => { if (!req.isAuthenticated()) return res.redirect('/login/'); res.redirect('/shop/'); });

app.get('/api/user', (req, res) => {
    if (req.isAuthenticated()) {
        const username = req.user.email.split('@')[0];
        res.json({ loggedIn: true, user: { id: req.user.id, email: req.user.email, username: username, balance: req.user.balance } });
    } else { res.json({ loggedIn: false }); }
});

// Update the order confirmation logic to send a real-time notification
app.get('/api/orders/update', async (req, res) => {
    const { orderId, newStatus, token } = req.query;
    if (token !== process.env.UPDATE_ORDER_SECRET_TOKEN) return res.status(401).send('<h1>Lỗi: Token không hợp lệ.</h1>');
    if (!orderId || !newStatus) return res.status(400).send('<h1>Lỗi: Thiếu thông tin đơn hàng hoặc trạng thái mới.</h1>');
    try {
        const updatedOrder = await Order.findOneAndUpdate({ orderId: orderId }, { status: newStatus }, { new: true });
        if (!updatedOrder) return res.status(404).send('<h1>Lỗi: Không tìm thấy đơn hàng.</h1>');

        // Send real-time notification to the user
        sendToUser(updatedOrder.userId, {
            type: 'ORDER_UPDATED',
            data: { order: updatedOrder }
        });

        res.send(`<div style="font-family: Arial; text-align: center; padding: 50px;"><h1 style="color: #5cb85c;">Cập nhật thành công!</h1><p>Đã cập nhật trạng thái đơn hàng <strong>#${orderId}</strong> thành "<strong>${newStatus}</strong>".</p><p><a href="/shop/">Quay lại trang shop</a></p></div>`);
    } catch (error) { console.error("Order update error:", error); res.status(500).send('<h1>Lỗi: Có lỗi xảy ra phía máy chủ.</h1>'); }
});

// Update the deposit confirmation logic to send a real-time notification
app.get('/api/deposit/confirm', async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).send('<h1>Token không hợp lệ.</h1>');
    try {
        const deposit = await Deposit.findOne({ confirmationToken: token });

        if (!deposit || deposit.status === 'completed') {
            return res.status(404).send('<h1>Yêu cầu nạp tiền không tồn tại hoặc đã được xử lý.</h1>');
        }

        const user = await User.findByIdAndUpdate(deposit.userId, { $inc: { balance: deposit.amount } }, { new: true });
        deposit.status = 'completed';
        await deposit.save();

        if (!user) return res.status(404).send('<h1>Không tìm thấy người dùng.</h1>');

        // Send real-time notification to the user
        sendToUser(deposit.userId, {
            type: 'DEPOSIT_COMPLETED',
            data: {
                newBalance: user.balance,
                deposit: deposit
            }
        });

        res.send(`<div style="font-family: Arial; text-align: center; padding: 50px;"><h1 style="color: #28a745;">Thành công!</h1><p>Đã cộng <strong>${deposit.amount.toLocaleString('vi-VN')}đ</strong> vào tài khoản của <strong>${user.email.split('@')[0]}</strong>.</p></div>`);
    } catch (error) {
        console.error("Deposit confirmation error:", error);
        res.status(500).send('<h1>Lỗi máy chủ.</h1>');
    }
});


// Other routes remain unchanged
app.post('/api/purchase', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để mua hàng.' });
    const { name, price, email: customerEmail } = req.body;
    if (!name || price === undefined) return res.status(400).json({ success: false, message: 'Thông tin sản phẩm không hợp lệ.' });
    try {
        const user = await User.findById(req.user.id);
        if (user.balance < price) return res.status(400).json({ success: false, message: 'Số dư của bạn không đủ.' });
        user.balance -= price;
        const orderId = crypto.randomBytes(4).toString('hex').toUpperCase();
        const newOrder = new Order({ orderId, userId: user._id, productName: name, price, customerEmail, status: 'Đang đợi duyệt' });
        await Promise.all([user.save(), newOrder.save()]);
        res.json({ success: true, message: 'Thanh toán thành công!', newBalance: user.balance });
    } catch (err) { console.error("Purchase error:", err); res.status(500).json({ success: false, message: 'Lỗi máy chủ, vui lòng thử lại.' }); }
});

app.post('/api/deposit/request', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
    }
    const { amount } = req.body;
    const depositAmount = parseInt(amount, 10);

    if (!depositAmount || depositAmount <= 1000) {
        return res.status(400).json({ success: false, message: 'Số tiền nạp phải lớn hơn 1,000đ.' });
    }

    try {
        const user = req.user;
        const confirmationToken = crypto.randomBytes(20).toString('hex');

        const newDeposit = new Deposit({
            userId: user.id,
            amount: depositAmount,
            status: 'pending',
            confirmationToken: confirmationToken
        });
        await newDeposit.save();
        const confirmationUrl = `${req.protocol}://${req.get('host')}/api/deposit/confirm?token=${confirmationToken}`;
        const emailHtml = `<h1>Yêu cầu nạp tiền mới!</h1><p>Người dùng: <strong>${user.email.split('@')[0]}</strong></p><p>Số tiền: <strong>${depositAmount.toLocaleString('vi-VN')}đ</strong></p><p>Để xác nhận và cộng tiền, vui lòng nhấn vào liên kết:</p><a href="${confirmationUrl}">Xác nhận đã nhận tiền</a>`;

        let transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
        await transporter.sendMail({
            from: `"Shop Tech Noti" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: `Yêu cầu nạp tiền`,
            html: emailHtml,
        });

        res.json({ success: true, message: 'Yêu cầu của bạn đã được gửi đi.' });
    } catch (err) {
        console.error("Deposit request error:", err);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ, vui lòng thử lại.' });
    }
});

app.get('/api/orders', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json([]);
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
});

app.get('/api/deposit/history', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json([]);
    const deposits = await Deposit.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(deposits);
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
